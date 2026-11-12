import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Modelo de identidad: cada participante tiene un `token` secreto
 * (aleatorio, 256 bits) que solo conoce su propio navegador, y un
 * `userId` público derivado como sha256(token).
 *
 * Por qué dos cosas y no una sola: el `userId` del host viaja en el
 * estado público de la sala (`RoomState.hostId`) a todos los
 * participantes — si ese mismo valor fuera la credencial de autorización,
 * cualquiera que conozca el código de sala podría leerlo y actuar como
 * host. Con el hash, ver el `hostId` no permite recuperar el token (sha256
 * no es reversible), y solo quien tiene el token puede probar que es el
 * host. El servidor no necesita guardar tokens: los recalcula al vuelo.
 */
export const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function userIdFromToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Valida el formato antes de hashear: acota el largo de lo que acepta el servidor y descarta basura temprano. */
export function isValidToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** Comparación en tiempo constante, para no filtrar por timing cuántos caracteres coincidieron. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
