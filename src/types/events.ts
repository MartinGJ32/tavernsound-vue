import type { Track } from "./track";
import { isTrack } from "./track";
import type { PlaybackAnchor } from "./room";
import { isPlaybackAnchor } from "./room";
import type { ChatMessage } from "./chat";
import { isChatMessage } from "./chat";

/**
 * Eventos que el backend emite por Socket.io a todos los conectados a una sala.
 *
 * PLAY / PAUSE / SEEK / TRACK_CHANGE llevan siempre un PlaybackAnchor, no
 * solo "pasó esto": así el cliente puede recalcular su posición aunque el
 * evento le llegue con latencia, y el mismo tipo de payload sirve tanto
 * para la acción en vivo como para la resincronización al reconectar.
 *
 * QUEUE_SYNC manda la cola completa en vez de un diff (agregar/quitar/
 * reordenar por separado). Es más tráfico, pero la cola tiene como mucho
 * MAX_QUEUE_SIZE elementos, y evita toda una clase de bugs de parches que
 * llegan desordenados o se pisan entre sí — el mismo criterio que ya usaba
 * la app original al reemitir `syncPlaylist` completo ante cualquier
 * cambio.
 */
export type RoomEvent =
  | { type: "PLAY"; anchor: PlaybackAnchor }
  | { type: "PAUSE"; anchor: PlaybackAnchor }
  | { type: "SEEK"; anchor: PlaybackAnchor }
  | { type: "TRACK_CHANGE"; track: Track; anchor: PlaybackAnchor }
  | { type: "QUEUE_SYNC"; queue: Track[] }
  | { type: "HOST_CHANGED"; hostId: string; hostName: string }
  | { type: "CHAT_MESSAGE"; message: ChatMessage };

const ROOM_EVENT_TYPES = [
  "PLAY",
  "PAUSE",
  "SEEK",
  "TRACK_CHANGE",
  "QUEUE_SYNC",
  "HOST_CHANGED",
  "CHAT_MESSAGE",
] as const satisfies readonly RoomEvent["type"][];

/** Nombre de evento bajo el cual se emite cada RoomEvent — compartido entre el servidor (server/socket.ts) y el cliente (useRealtime). */
export const ROOM_EVENT_NAME = "room-event";

/**
 * El payload que llega por Socket.io está tipado como `unknown`: puede
 * venir de un cliente con una versión vieja, o directamente de alguien
 * jugando con la consola de red. Nunca lo tratamos como RoomEvent con un
 * cast directo —
 * se valida acá primero. Si no matchea ninguna forma conocida, quien llama
 * decide qué hacer (típicamente: ignorar y loguear, nunca "arreglarlo"
 * adivinando campos faltantes).
 */
export function parseRoomEvent(data: unknown): RoomEvent | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as Record<string, unknown>;
  const { type } = candidate;

  if (typeof type !== "string" || !(ROOM_EVENT_TYPES as readonly string[]).includes(type)) {
    return null;
  }

  switch (type as RoomEvent["type"]) {
    case "PLAY":
    case "PAUSE":
    case "SEEK":
      return isPlaybackAnchor(candidate.anchor)
        ? { type: type as "PLAY" | "PAUSE" | "SEEK", anchor: candidate.anchor }
        : null;

    case "TRACK_CHANGE":
      return isPlaybackAnchor(candidate.anchor) && isTrack(candidate.track)
        ? { type: "TRACK_CHANGE", track: candidate.track, anchor: candidate.anchor }
        : null;

    case "QUEUE_SYNC":
      return Array.isArray(candidate.queue) && candidate.queue.every(isTrack)
        ? { type: "QUEUE_SYNC", queue: candidate.queue }
        : null;

    case "HOST_CHANGED":
      return typeof candidate.hostId === "string" && typeof candidate.hostName === "string"
        ? { type: "HOST_CHANGED", hostId: candidate.hostId, hostName: candidate.hostName }
        : null;

    case "CHAT_MESSAGE":
      return isChatMessage(candidate.message)
        ? { type: "CHAT_MESSAGE", message: candidate.message }
        : null;

    default:
      return null;
  }
}
