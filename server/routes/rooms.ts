import { Router, type Request } from "express";
import type { RoomEvent } from "../../src/types";
import {
  addTrackToQueue,
  clearQueue,
  createRoom,
  getRoom,
  joinRoom,
  playTrackAt,
  removeTrackFromQueue,
  reorderQueue,
  setPlaybackState,
  shuffleQueue,
} from "../lib/roomService";
import { sendError, sendJson, toApiError } from "../lib/http";

type Broadcaster = (code: string, event: RoomEvent) => void;

/**
 * El token (secreto del participante, ver server/lib/auth.ts) viaja en el
 * header `Authorization: Bearer <token>` y no en el body ni en la URL:
 * así no aparece en logs de acceso, historial ni query strings. Si falta
 * o está mal formado devuelve "" y `assertIsHost` lo rechaza igual.
 */
function bearerToken(req: Request): string {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

function bodyString(body: unknown, key: string): string {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Un solo router para todo `/rooms/*`. Cada handler es una capa fina
 * sobre `roomService` (autorización y mutación de estado) que, ante una
 * mutación exitosa, avisa por `broadcast` — la función que le pasa
 * `server/index.ts`, respaldada por Socket.io — a todos los conectados a
 * esa sala.
 */
export function createRoomsRouter(broadcast: Broadcaster): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const result = await createRoom({ hostName: bodyString(req.body, "userName") });
    if (!result.ok) {
      sendError(res, toApiError(result.error));
      return;
    }
    sendJson(res, { room: result.value.room, userId: result.value.hostUserId, token: result.value.hostToken }, 201);
  });

  router.get("/:code", async (req, res) => {
    const room = await getRoom(req.params.code);
    if (!room) {
      sendError(res, { code: "ROOM_NOT_FOUND", message: "La sala no existe o ya expiró." });
      return;
    }
    sendJson(res, room);
  });

  router.post("/:code/join", async (req, res) => {
    const result = await joinRoom({ code: req.params.code, userName: bodyString(req.body, "userName") });
    if (!result.ok) {
      sendError(res, toApiError(result.error));
      return;
    }
    sendJson(res, { room: result.value.room, userId: result.value.userId, token: result.value.token });
  });

  router.post("/:code/queue", async (req, res) => {
    const { code } = req.params;
    const result = await addTrackToQueue({
      code,
      token: bearerToken(req),
      videoInput: bodyString(req.body, "videoInput"),
      title: bodyString(req.body, "title"),
    });
    if (!result.ok) {
      sendError(res, toApiError(result.error));
      return;
    }
    broadcast(code, { type: "QUEUE_SYNC", queue: result.value.queue });
    sendJson(res, result.value, 201);
  });

  // DELETE con ?index=N quita un track puntual; sin `index`, vacía toda
  // la cola — mismo criterio que en la versión anterior de este endpoint.
  router.delete("/:code/queue", async (req, res) => {
    const { code } = req.params;
    const token = bearerToken(req);
    const rawIndex = req.query.index;

    const result =
      typeof rawIndex === "string"
        ? await removeTrackFromQueue({ code, token, index: Number(rawIndex) })
        : await clearQueue({ code, token });

    if (!result.ok) {
      sendError(res, toApiError(result.error));
      return;
    }
    broadcast(code, { type: "QUEUE_SYNC", queue: result.value.queue });
    sendJson(res, result.value);
  });

  router.patch("/:code/queue", async (req, res) => {
    const { code } = req.params;
    const token = bearerToken(req);

    const result =
      req.body?.shuffle === true
        ? await shuffleQueue({ code, token })
        : await reorderQueue({ code, token, from: Number(req.body?.from), to: Number(req.body?.to) });

    if (!result.ok) {
      sendError(res, toApiError(result.error));
      return;
    }
    broadcast(code, { type: "QUEUE_SYNC", queue: result.value.queue });
    sendJson(res, result.value);
  });

  router.post("/:code/playback", async (req, res) => {
    const { code } = req.params;
    const result = await playTrackAt({ code, token: bearerToken(req), index: Number(req.body?.index) });
    if (!result.ok) {
      sendError(res, toApiError(result.error));
      return;
    }

    const room = result.value;
    // playTrackAt cambia dos cosas a la vez —qué suena y qué queda en la
    // cola—, así que se avisan los dos eventos por separado.
    if (room.currentTrack) {
      broadcast(code, { type: "TRACK_CHANGE", track: room.currentTrack, anchor: room.anchor });
    }
    broadcast(code, { type: "QUEUE_SYNC", queue: room.queue });
    sendJson(res, room);
  });

  router.patch("/:code/playback", async (req, res) => {
    const { code } = req.params;
    const isPlaying = Boolean(req.body?.isPlaying);
    const result = await setPlaybackState({
      code,
      token: bearerToken(req),
      isPlaying,
      position: Number(req.body?.position),
    });
    if (!result.ok) {
      sendError(res, toApiError(result.error));
      return;
    }

    // PLAY y PAUSE cubren también "seek": el anchor ya trae la posición
    // nueva sea cual sea el motivo, y el cliente aplica los tres tipos
    // exactamente igual (ver parseRoomEvent) — no hace falta que este
    // endpoint adivine cuál de los tres fue "la intención".
    broadcast(code, { type: isPlaying ? "PLAY" : "PAUSE", anchor: result.value.anchor });
    sendJson(res, result.value);
  });

  return router;
}
