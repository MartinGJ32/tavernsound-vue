import type { RoomState } from "./room";

/**
 * Códigos de error estables en vez de un mensaje libre: el frontend
 * necesita reaccionar distinto según el caso (p. ej. "la sala no existe"
 * manda a Home con un aviso, mientras que "no autorizado" solo deshabilita
 * un botón) sin parsear texto para adivinar qué pasó. `message` sigue
 * estando para mostrarlo tal cual si no hay un manejo especial para ese
 * código.
 */
export type ApiErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NOT_HOST"
  | "INVALID_VIDEO_ID"
  | "QUEUE_FULL"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export interface CreateRoomResponse {
  room: RoomState;
  /** Identidad pública (sha256 del token): es lo que aparece como `hostId` y en los mensajes de chat. */
  userId: string;
  /**
   * Credencial secreta de este participante. Se devuelve una sola vez, solo
   * a quien creó/se unió, y vive únicamente en su navegador — nunca se
   * transmite a otros usuarios ni forma parte de `RoomState`.
   */
  token: string;
}

export interface JoinRoomRequest {
  userName: string;
}

export type JoinRoomResponse = CreateRoomResponse;
