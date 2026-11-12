import { Redis } from "@upstash/redis";
import type { RoomState } from "../../src/types";
import type { RoomStore } from "./roomStore";
import { ROOM_TTL_SECONDS } from "./roomStore";

function roomKey(code: string): string {
  return `room:${code}`;
}

/**
 * Implementación real sobre Upstash Redis (ver README, sección de
 * variables de entorno). Usa el cliente REST de Upstash en vez de un
 * cliente Redis nativo con pool de conexiones (como `ioredis`) — para el
 * volumen de este proyecto (mutaciones de sala poco frecuentes, no un
 * sistema de alto throughput) la diferencia de latencia no justifica la
 * complejidad extra de manejar un pool a mano en un proceso persistente.
 */
export function createUpstashRoomStore(): RoomStore {
  const redis = Redis.fromEnv();

  return {
    async get(code) {
      const room = await redis.get<RoomState>(roomKey(code));
      return room ?? null;
    },

    async createIfAbsent(room) {
      // NX: solo escribe si la clave todavía no existe. Es la operación
      // atómica que evita una condición de carrera si dos pedidos de
      // creación generan el mismo código al mismo tiempo — poco probable
      // con este alfabeto, pero "poco probable" no es "imposible".
      const result = await redis.set(roomKey(room.id), room, {
        nx: true,
        ex: ROOM_TTL_SECONDS,
      });
      return result === "OK";
    },

    async save(room) {
      await redis.set(roomKey(room.id), room, { ex: ROOM_TTL_SECONDS });
    },
  };
}
