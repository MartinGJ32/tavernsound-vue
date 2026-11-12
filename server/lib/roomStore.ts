import type { RoomState } from "../../src/types";
import { hasUpstashCredentials } from "../config";
import { createMemoryRoomStore } from "./memoryRoomStore";
import { createUpstashRoomStore } from "./upstashRoomStore";

export interface RoomStore {
  get(code: string): Promise<RoomState | null>;
  /** Crea la sala solo si el código todavía no existe. Devuelve false ante colisión, para que el llamador reintente con otro código. */
  createIfAbsent(room: RoomState): Promise<boolean>;
  save(room: RoomState): Promise<void>;
}

/**
 * 24hs de inactividad y la sala se limpia sola. Sin esto, cada sala creada
 * quedaría para siempre en la base — ver el riesgo de "salas huérfanas"
 * señalado en el análisis de migración.
 */
export const ROOM_TTL_SECONDS = 60 * 60 * 24;

let cachedStore: RoomStore | null = null;

/**
 * Devuelve la implementación real (Upstash) si hay credenciales
 * configuradas, o una en memoria si no las hay. La memoria sirve para
 * desarrollar sin una base real, pero las salas se pierden al reiniciar el
 * proceso. Que producción arranque sin credenciales se avisa una sola vez,
 * al arrancar (ver server/index.ts), no acá.
 */
export function getRoomStore(): RoomStore {
  if (cachedStore) return cachedStore;
  cachedStore = hasUpstashCredentials() ? createUpstashRoomStore() : createMemoryRoomStore();
  return cachedStore;
}

/** Qué almacenamiento se está usando (o se usaría) según el entorno — lo muestran /api/health y `npm run diagnose`. */
export function activeStoreKind(): "upstash" | "memory" {
  return hasUpstashCredentials() ? "upstash" : "memory";
}

/** Solo para tests: fuerza una implementación específica y limpia la caché. */
export function setRoomStoreForTesting(store: RoomStore | null): void {
  cachedStore = store;
}
