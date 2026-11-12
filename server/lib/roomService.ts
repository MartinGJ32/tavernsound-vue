import type { RoomState, Track } from "../../src/types";
import { MAX_QUEUE_SIZE, MAX_USER_NAME_LENGTH, extractYouTubeId, isValidYouTubeId, sanitizeText } from "../../src/utils/validation";
import { generateToken, isValidToken, safeEqual, userIdFromToken } from "./auth";
import { generateRoomCode } from "./roomCode";
import { getRoomStore } from "./roomStore";
import type { RoomStore } from "./roomStore";

export type RoomServiceError =
  | { code: "ROOM_NOT_FOUND" }
  | { code: "NOT_HOST" }
  | { code: "INVALID_VIDEO_ID" }
  | { code: "QUEUE_FULL" }
  | { code: "INVALID_REQUEST"; message: string };

export type RoomServiceResult<T> = { ok: true; value: T } | { ok: false; error: RoomServiceError };

const MAX_CODE_GENERATION_ATTEMPTS = 5;

function emptyAnchor(): RoomState["anchor"] {
  return { position: 0, isPlaying: false, serverTimestamp: Date.now() };
}

export interface CreateRoomInput {
  hostName: string;
}

export interface CreatedRoom {
  room: RoomState;
  hostUserId: string;
  /** Secreto del host: se le devuelve una sola vez a quien creó la sala y nunca se guarda ni se transmite a nadie más. */
  hostToken: string;
}

/**
 * Crea una sala con un código único. Reintenta ante colisión de código en
 * vez de fallar directo: con este alfabeto la probabilidad es minúscula,
 * y como `createIfAbsent` es atómico (NX en Redis), reintentar es gratis
 * y evita rechazar a alguien por pura mala suerte estadística.
 */
export async function createRoom(
  input: CreateRoomInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<CreatedRoom>> {
  const hostName = sanitizeText(input.hostName, MAX_USER_NAME_LENGTH);
  if (!hostName) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "El nombre no puede estar vacío." } };
  }

  const hostToken = generateToken();
  const hostUserId = userIdFromToken(hostToken);

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const room: RoomState = {
      id: code,
      hostId: hostUserId,
      currentTrack: null,
      queue: [],
      anchor: emptyAnchor(),
      createdAt: Date.now(),
    };

    if (await store.createIfAbsent(room)) {
      return { ok: true, value: { room, hostUserId, hostToken } };
    }
  }

  return {
    ok: false,
    error: { code: "INVALID_REQUEST", message: "No se pudo generar un código de sala único. Probá de nuevo." },
  };
}

export async function getRoom(code: string, store: RoomStore = getRoomStore()): Promise<RoomState | null> {
  return store.get(code.toUpperCase());
}

export interface JoinRoomInput {
  code: string;
  userName: string;
}

/**
 * A quién se une NO se le asigna el rol de host — eso lo decide quién creó
 * la sala. La reasignación de host cuando el host original se desconecta
 * depende de presencia en tiempo real (quién sigue conectado), así que
 * vive en `server/socket.ts` (que sí tiene esa información), no acá.
 */
export async function joinRoom(
  input: JoinRoomInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<{ room: RoomState; userId: string; token: string }>> {
  const room = await store.get(input.code.toUpperCase());
  if (!room) {
    return { ok: false, error: { code: "ROOM_NOT_FOUND" } };
  }

  const userName = sanitizeText(input.userName, MAX_USER_NAME_LENGTH);
  if (!userName) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "El nombre no puede estar vacío." } };
  }

  const token = generateToken();
  return { ok: true, value: { room, userId: userIdFromToken(token), token } };
}

/**
 * Valida que quien pide un comando de host realmente lo sea. Ver
 * HOST_ONLY_COMMANDS (Fase 2) para la lista de comandos que lo requieren.
 * Esto es la autorización real — el frontend puede deshabilitar un botón
 * para dar feedback inmediato, pero eso es solo UX, nunca la barrera.
 */
export function assertIsHost(room: RoomState, token: string): RoomServiceResult<true> {
  // Se hashea el token presentado y se compara con el hostId público. Que
  // el hostId lo vea cualquiera no alcanza para actuar como host: hace
  // falta el token del que sale (ver server/lib/auth.ts).
  if (!isValidToken(token) || !safeEqual(userIdFromToken(token), room.hostId)) {
    return { ok: false, error: { code: "NOT_HOST" } };
  }
  return { ok: true, value: true };
}

export interface AddTrackInput {
  code: string;
  token: string;
  videoInput: string; // ID pelado o URL completa de YouTube
  title: string;
}

/**
 * Agrega un track a la cola. Es la implementación de referencia del
 * patrón que siguen el resto de los comandos de host (buscar sala →
 * autorizar → validar → mutar → persistir), reutilizado abajo por
 * `removeTrackFromQueue`, `reorderQueue` y `clearQueue`.
 */
export async function addTrackToQueue(
  input: AddTrackInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<RoomState>> {
  const room = await store.get(input.code.toUpperCase());
  if (!room) return { ok: false, error: { code: "ROOM_NOT_FOUND" } };

  const hostCheck = assertIsHost(room, input.token);
  if (!hostCheck.ok) return hostCheck;

  const videoId = extractYouTubeId(input.videoInput);
  if (!videoId || !isValidYouTubeId(videoId)) {
    return { ok: false, error: { code: "INVALID_VIDEO_ID" } };
  }

  if (room.queue.length >= MAX_QUEUE_SIZE) {
    return { ok: false, error: { code: "QUEUE_FULL" } };
  }

  const track: Track = {
    id: videoId,
    title: sanitizeText(input.title, 150) || "Video",
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
  };

  const updatedRoom: RoomState = { ...room, queue: [...room.queue, track] };
  await store.save(updatedRoom);
  return { ok: true, value: updatedRoom };
}

export interface RemoveTrackInput {
  code: string;
  token: string;
  index: number;
}

export async function removeTrackFromQueue(
  input: RemoveTrackInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<RoomState>> {
  const room = await store.get(input.code.toUpperCase());
  if (!room) return { ok: false, error: { code: "ROOM_NOT_FOUND" } };

  const hostCheck = assertIsHost(room, input.token);
  if (!hostCheck.ok) return hostCheck;

  if (!Number.isInteger(input.index) || input.index < 0 || input.index >= room.queue.length) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Esa posición ya no existe en la cola." } };
  }

  const queue = [...room.queue];
  queue.splice(input.index, 1);

  const updatedRoom: RoomState = { ...room, queue };
  await store.save(updatedRoom);
  return { ok: true, value: updatedRoom };
}

export interface ReorderQueueInput {
  code: string;
  token: string;
  from: number;
  to: number;
}

export async function reorderQueue(
  input: ReorderQueueInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<RoomState>> {
  const room = await store.get(input.code.toUpperCase());
  if (!room) return { ok: false, error: { code: "ROOM_NOT_FOUND" } };

  const hostCheck = assertIsHost(room, input.token);
  if (!hostCheck.ok) return hostCheck;

  const { from, to } = input;
  const lastIndex = room.queue.length - 1;
  const inBounds = (value: number) => Number.isInteger(value) && value >= 0 && value <= lastIndex;

  if (!inBounds(from) || !inBounds(to) || from === to) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Ese movimiento no es válido." } };
  }

  const queue = [...room.queue];
  const [moved] = queue.splice(from, 1);
  queue.splice(to, 0, moved);

  const updatedRoom: RoomState = { ...room, queue };
  await store.save(updatedRoom);
  return { ok: true, value: updatedRoom };
}

export interface ShuffleQueueInput {
  code: string;
  token: string;
}

/**
 * Mezcla el orden de toda la cola al azar (Fisher-Yates). Es un comando
 * distinto de "modo aleatorio" del reproductor: acá reordena la cola de
 * una — no cambia cómo se elige el próximo track en el futuro.
 */
export async function shuffleQueue(
  input: ShuffleQueueInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<RoomState>> {
  const room = await store.get(input.code.toUpperCase());
  if (!room) return { ok: false, error: { code: "ROOM_NOT_FOUND" } };

  const hostCheck = assertIsHost(room, input.token);
  if (!hostCheck.ok) return hostCheck;

  const queue = [...room.queue];
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  const updatedRoom: RoomState = { ...room, queue };
  await store.save(updatedRoom);
  return { ok: true, value: updatedRoom };
}

export interface ClearQueueInput {
  code: string;
  token: string;
}

/**
 * Vacía la cola de próximos temas. A diferencia de la app original —donde
 * "vaciar" también cortaba lo que estaba sonando—, acá `currentTrack` y
 * `anchor` quedan intactos: la cola es lo que sigue, no lo que está
 * sonando ahora, así que vaciarla no debería interrumpir la reproducción
 * en curso.
 */
export async function clearQueue(
  input: ClearQueueInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<RoomState>> {
  const room = await store.get(input.code.toUpperCase());
  if (!room) return { ok: false, error: { code: "ROOM_NOT_FOUND" } };

  const hostCheck = assertIsHost(room, input.token);
  if (!hostCheck.ok) return hostCheck;

  const updatedRoom: RoomState = { ...room, queue: [] };
  await store.save(updatedRoom);
  return { ok: true, value: updatedRoom };
}

export interface PlayTrackAtInput {
  code: string;
  token: string;
  index: number;
}

/**
 * Saca el track de la posición `index` de la cola y lo pone a sonar ya
 * mismo: queda como `currentTrack`, con el anchor reseteado a "arrancando
 * desde 0". Es host-only por la misma razón que el resto de los comandos
 * de reproducción — nadie más decide qué suena.
 *
 * Esta función solo persiste el estado (Redis); avisarle en vivo a los
 * demás conectados es responsabilidad de quien la llama (ver
 * `server/routes/rooms.ts`, que hace el broadcast por Socket.io después).
 * Separar las dos cosas es lo que permite testear esta lógica sin
 * necesitar una conexión de Socket.io real.
 */
export async function playTrackAt(
  input: PlayTrackAtInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<RoomState>> {
  const room = await store.get(input.code.toUpperCase());
  if (!room) return { ok: false, error: { code: "ROOM_NOT_FOUND" } };

  const hostCheck = assertIsHost(room, input.token);
  if (!hostCheck.ok) return hostCheck;

  if (!Number.isInteger(input.index) || input.index < 0 || input.index >= room.queue.length) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Esa posición ya no existe en la cola." } };
  }

  const queue = [...room.queue];
  const [track] = queue.splice(input.index, 1);

  const updatedRoom: RoomState = {
    ...room,
    queue,
    currentTrack: track ?? null,
    anchor: { position: 0, isPlaying: true, serverTimestamp: Date.now() },
  };
  await store.save(updatedRoom);
  return { ok: true, value: updatedRoom };
}

export interface SetPlaybackStateInput {
  code: string;
  token: string;
  isPlaying: boolean;
  position: number;
}

/**
 * Actualiza play/pausa/posición sobre el track que ya está sonando. Cubre
 * play, pausa y seek con una sola función porque los tres terminan siendo
 * "el cliente ya calculó la posición correcta, escribila con un
 * serverTimestamp fresco" — separarlos en tres funciones casi idénticas
 * no agregaría claridad.
 */
export async function setPlaybackState(
  input: SetPlaybackStateInput,
  store: RoomStore = getRoomStore(),
): Promise<RoomServiceResult<RoomState>> {
  const room = await store.get(input.code.toUpperCase());
  if (!room) return { ok: false, error: { code: "ROOM_NOT_FOUND" } };

  if (!room.currentTrack) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "No hay nada sonando todavía." } };
  }

  const hostCheck = assertIsHost(room, input.token);
  if (!hostCheck.ok) return hostCheck;

  if (!Number.isFinite(input.position) || input.position < 0) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Posición inválida." } };
  }

  const updatedRoom: RoomState = {
    ...room,
    anchor: { position: input.position, isPlaying: input.isPlaying, serverTimestamp: Date.now() },
  };
  await store.save(updatedRoom);
  return { ok: true, value: updatedRoom };
}
