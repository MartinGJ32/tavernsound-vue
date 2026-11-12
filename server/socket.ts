import { randomUUID } from "node:crypto";
import type { DefaultEventsMap, Server, Socket } from "socket.io";
import type { ChatMessage, RoomEvent } from "../src/types";
import { ROOM_EVENT_NAME } from "../src/types";
import { MAX_CHAT_MESSAGE_LENGTH, MAX_USER_NAME_LENGTH, sanitizeText } from "../src/utils/validation";
import { loadConfig } from "./config";
import { isValidToken, userIdFromToken } from "./lib/auth";
import { createSlidingWindowLimiter } from "./lib/rateLimit";
import { getRoom } from "./lib/roomService";
import { getRoomStore } from "./lib/roomStore";

interface SocketData {
  code?: string;
  userId?: string;
  userName?: string;
}

type AppServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

interface JoinPayload {
  code?: string;
  token?: string;
  userName?: string;
}

// Margen de gracia antes de reasignar el host, y tope de mensajes de chat por
// socket (alcanza de sobra para charlar y frena el spam). Valores y defaults:
// ver server/config.ts. El margen de gracia se puede bajar por variable de
// entorno para probarlo rápido; ver el comentario en el handler de
// "disconnect" más abajo.
const { hostReassignmentGraceMs: HOST_REASSIGNMENT_GRACE_MS, limits } = loadConfig();

function listenerCount(io: AppServer, code: string): number {
  return io.sockets.adapter.rooms.get(code)?.size ?? 0;
}

function broadcastRoomEvent(io: AppServer, code: string, event: RoomEvent): void {
  io.to(code).emit(ROOM_EVENT_NAME, event);
}

/** ¿Sigue conectado este usuario a la sala por *algún* socket? Hace falta para no reasignar el host cuando cierra una pestaña de varias que tenía abiertas. */
function isUserStillConnected(io: AppServer, code: string, userId: string): boolean {
  const socketIds = io.sockets.adapter.rooms.get(code);
  if (!socketIds) return false;
  for (const socketId of socketIds) {
    if (io.sockets.sockets.get(socketId)?.data.userId === userId) return true;
  }
  return false;
}

/**
 * No hay ningún criterio de "mejor candidato" — el primero que se
 * encuentre entre los que quedan conectados alcanza, porque nada en el
 * dominio hace a un oyente más apto que otro para ser el próximo host.
 */
function pickReplacementHost(io: AppServer, code: string): { userId: string; userName: string } | null {
  const socketIds = io.sockets.adapter.rooms.get(code);
  if (!socketIds) return null;

  for (const socketId of socketIds) {
    const candidate = io.sockets.sockets.get(socketId);
    if (candidate?.data.userId) {
      return { userId: candidate.data.userId, userName: candidate.data.userName ?? "Alguien" };
    }
  }
  return null;
}

async function handleHostDisconnect(io: AppServer, code: string, leavingUserId: string): Promise<void> {
  if (isUserStillConnected(io, code, leavingUserId)) return;

  const store = getRoomStore();
  const room = await store.get(code);
  if (!room || room.hostId !== leavingUserId) return; // no era el host: no hay nada que reasignar

  const replacement = pickReplacementHost(io, code);
  if (!replacement) return; // la sala quedó vacía — no hay a quién promover

  await store.save({ ...room, hostId: replacement.userId });
  broadcastRoomEvent(io, code, { type: "HOST_CHANGED", hostId: replacement.userId, hostName: replacement.userName });
}

export function registerSocketHandlers(io: AppServer): void {
  io.on("connection", (socket: AppSocket) => {
    const chatLimiter = createSlidingWindowLimiter(limits.chatMaxMessages, limits.chatWindowMs);

    socket.on("join", async (payload: JoinPayload) => {
      try {
        const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : "";
        // El cliente manda su token secreto, nunca su userId: la identidad
        // (userId) la deriva el servidor, así que nadie puede declararse
        // otra persona — ni el host — en el handshake.
        if (!code || !isValidToken(payload?.token)) {
          socket.emit("joinError", { message: "Datos de conexión inválidos." });
          return;
        }

        // Confirma que la sala existe antes de sumar el socket — evita
        // sockets "fantasma" unidos a una sala que ya expiró en Redis.
        const room = await getRoom(code);
        if (!room) {
          socket.emit("joinError", { message: "La sala no existe o ya expiró." });
          return;
        }

        socket.data.code = code;
        socket.data.userId = userIdFromToken(payload.token);
        socket.data.userName = sanitizeText(payload.userName ?? "", MAX_USER_NAME_LENGTH) || "Viajero";

        await socket.join(code);
        io.to(code).emit("listenerCount", listenerCount(io, code));
      } catch (err) {
        // Un fallo de Redis acá no debe tumbar el proceso entero (una
        // promesa rechazada sin capturar termina Node por default).
        console.error("[socket] error en join:", err);
        socket.emit("joinError", { message: "No se pudo unir a la sala. Probá de nuevo." });
      }
    });

    socket.on("chatMessage", (text: unknown) => {
      const { code, userId, userName } = socket.data;
      if (!code || !userId || !userName) return;
      if (typeof text !== "string") return;

      const sanitized = sanitizeText(text, MAX_CHAT_MESSAGE_LENGTH);
      if (!sanitized) return;

      if (!chatLimiter.allow()) {
        socket.emit("chatRateLimited");
        return;
      }

      const message: ChatMessage = { id: randomUUID(), userId, userName, text: sanitized, sentAt: Date.now() };
      broadcastRoomEvent(io, code, { type: "CHAT_MESSAGE", message });
    });

    socket.on("disconnect", () => {
      const { code, userId } = socket.data;
      if (!code) return;

      // El contador de oyentes baja ya mismo — es un indicador de "quién
      // está conectado ahora mismo", y acá Socket.io ya sacó al socket de
      // la room, así que listenerCount() ya refleja el número correcto.
      io.to(code).emit("listenerCount", listenerCount(io, code));

      // La reasignación de host, en cambio, espera un poco: un refresh de
      // página desconecta y reconecta el mismo socket en menos de un
      // segundo, normalmente. Sin este margen, ese hueco por sí solo le
      // haría perder el rol de host a quien refresca. Si para cuando corre
      // esto la misma persona ya volvió a conectarse a la sala,
      // `handleHostDisconnect` lo nota (`isUserStillConnected`) y no hace
      // nada.
      if (userId) {
        setTimeout(() => {
          handleHostDisconnect(io, code, userId).catch((err) => {
            console.error("[socket] error reasignando el host:", err);
          });
        }, HOST_REASSIGNMENT_GRACE_MS);
      }
    });
  });
}

/** Usado por las rutas REST (server/routes/rooms.ts) para avisarle por Socket.io a todos los conectados a la sala que algo cambió. */
export function createRoomBroadcaster(io: AppServer) {
  return (code: string, event: RoomEvent) => broadcastRoomEvent(io, code, event);
}
