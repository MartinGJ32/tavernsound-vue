import type { ApiError, CreateRoomResponse, JoinRoomRequest, JoinRoomResponse, RoomState } from "@/types";

/**
 * Envuelve un ApiError para poder tirarlo como excepción sin perder el
 * código estable — así quien llama puede hacer `if (err.apiError.code ===
 * "ROOM_NOT_FOUND")` en vez de parsear el mensaje.
 */
export class RoomApiError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = "RoomApiError";
    this.apiError = apiError;
  }
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const fallback: ApiError = { code: "INTERNAL_ERROR", message: "Algo salió mal en el servidor." };
    const apiError =
      data && typeof data === "object" && "error" in data ? (data as { error: ApiError }).error : fallback;
    throw new RoomApiError(apiError);
  }

  return data as T;
}

export async function createRoom(body: { userName: string }): Promise<CreateRoomResponse> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<CreateRoomResponse>(response);
}

export async function joinRoom(code: string, body: JoinRoomRequest): Promise<JoinRoomResponse> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<JoinRoomResponse>(response);
}

export async function getRoom(code: string): Promise<RoomState> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  return parseJsonOrThrow<RoomState>(response);
}

/**
 * Todas las mutaciones de sala se autentican con el token secreto del
 * participante en `Authorization: Bearer` (nunca en el body ni la URL: no
 * queda en logs de acceso ni en el historial). El servidor deriva de ahí
 * quién es y valida si es el host — ver server/lib/auth.ts.
 */
async function authedRequest(
  token: string,
  method: "POST" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
): Promise<RoomState> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseJsonOrThrow<RoomState>(response);
}

function roomPath(code: string, suffix: string): string {
  return `/api/rooms/${encodeURIComponent(code)}/${suffix}`;
}

export function addTrackToQueue(code: string, token: string, body: { videoInput: string; title: string }) {
  return authedRequest(token, "POST", roomPath(code, "queue"), body);
}

export function removeTrackFromQueue(code: string, token: string, index: number) {
  return authedRequest(token, "DELETE", `${roomPath(code, "queue")}?index=${index}`);
}

export function clearQueue(code: string, token: string) {
  return authedRequest(token, "DELETE", roomPath(code, "queue"));
}

export function reorderQueue(code: string, token: string, from: number, to: number) {
  return authedRequest(token, "PATCH", roomPath(code, "queue"), { from, to });
}

export function shuffleQueue(code: string, token: string) {
  return authedRequest(token, "PATCH", roomPath(code, "queue"), { shuffle: true });
}

export function playTrackAt(code: string, token: string, index: number) {
  return authedRequest(token, "POST", roomPath(code, "playback"), { index });
}

export function setPlaybackState(code: string, token: string, isPlaying: boolean, position: number) {
  return authedRequest(token, "PATCH", roomPath(code, "playback"), { isPlaying, position });
}

/** Mensaje listo para mostrar en la UI, sin que el componente sepa nada de RoomApiError. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof RoomApiError) return err.apiError.message;
  return "No pudimos conectar con el servidor. Probá de nuevo.";
}
