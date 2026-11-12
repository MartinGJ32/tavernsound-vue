import type { Response } from "express";
import type { ApiError, ApiErrorCode } from "../../src/types";
import type { RoomServiceError } from "./roomService";

const STATUS_BY_ERROR_CODE: Record<ApiErrorCode, number> = {
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  NOT_HOST: 403,
  INVALID_VIDEO_ID: 422,
  QUEUE_FULL: 409,
  RATE_LIMITED: 429,
  INVALID_REQUEST: 400,
  INTERNAL_ERROR: 500,
};

const DEFAULT_MESSAGES: Record<RoomServiceError["code"], string> = {
  ROOM_NOT_FOUND: "La sala no existe o ya expiró.",
  NOT_HOST: "Solo el anfitrión de la sala puede hacer esto.",
  INVALID_VIDEO_ID: "El video no es válido.",
  QUEUE_FULL: "La cola está llena (máx. 100).",
  INVALID_REQUEST: "Pedido inválido.",
};

export function toApiError(error: RoomServiceError): ApiError {
  const message = "message" in error ? error.message : DEFAULT_MESSAGES[error.code];
  return { code: error.code, message };
}

export function sendError(res: Response, error: ApiError): void {
  const status = STATUS_BY_ERROR_CODE[error.code] ?? 500;
  res.status(status).json({ error } satisfies { error: ApiError });
}

export function sendJson<T>(res: Response, body: T, status = 200): void {
  res.status(status).json(body);
}
