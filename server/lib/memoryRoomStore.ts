import type { RoomState } from "../../src/types";
import type { RoomStore } from "./roomStore";
import { ROOM_TTL_SECONDS } from "./roomStore";

interface Entry {
  room: RoomState;
  expiresAt: number;
}

/**
 * Implementación en memoria de RoomStore. Se usa automáticamente cuando no
 * hay credenciales de Upstash configuradas (desarrollo local sin una base
 * real) y en los tests, donde queremos verificar la lógica de negocio sin
 * depender de una base de datos real.
 *
 * No es apta para producción: cada instancia de función serverless tiene
 * su propia memoria, así que dos invocaciones distintas (o la misma
 * función "enfriada" y vuelta a arrancar) verían salas distintas.
 * `getRoomStore()` avisa fuerte por consola si esto pasa en producción.
 */
export function createMemoryRoomStore(): RoomStore {
  const rooms = new Map<string, Entry>();

  function isExpired(entry: Entry): boolean {
    return entry.expiresAt <= Date.now();
  }

  return {
    async get(code) {
      const entry = rooms.get(code);
      if (!entry || isExpired(entry)) {
        rooms.delete(code);
        return null;
      }
      return entry.room;
    },

    async createIfAbsent(room) {
      const existing = rooms.get(room.id);
      if (existing && !isExpired(existing)) return false;
      rooms.set(room.id, { room, expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 });
      return true;
    },

    async save(room) {
      rooms.set(room.id, { room, expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 });
    },
  };
}
