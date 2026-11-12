import type { Track } from "./track";

/**
 * Ancla de sincronización: en vez de mandar "dale play" y confiar en que
 * todos lo reciban al mismo tiempo, mandamos la posición que tenía el
 * track en un instante concreto (`serverTimestamp`) y si estaba
 * reproduciéndose. Cada cliente calcula su propia posición esperada como:
 *
 *   esperado = position + (isPlaying ? (ahora - serverTimestamp) / 1000 : 0)
 *
 * y corrige su reproductor contra eso — con tolerancia a jitter normal,
 * corrección suave para diferencias chicas, y un seek duro solo si la
 * diferencia es grande (ver `useSynchronization`, Fase 5). Esto es lo que
 * permite que alguien que entra tarde, o que estuvo desconectado, quede
 * sincronizado sin depender de su reloj local ni de cuándo le llegó el
 * evento.
 */
export interface PlaybackAnchor {
  position: number;
  isPlaying: boolean;
  serverTimestamp: number;
}

export interface RoomUser {
  id: string;
  name: string;
  isHost: boolean;
}

/**
 * Estado completo de una sala, tal como vive en Redis (ver RoomStore). Es
 * autoritativo: el cliente lo recibe (al entrar, al reconectar, o vía
 * eventos realtime) pero nunca lo edita directamente — toda modificación
 * pasa por un comando que el backend valida primero.
 */
export interface RoomState {
  id: string; // código de sala, ej. "F4K9XQ"
  hostId: string;
  currentTrack: Track | null;
  queue: Track[];
  anchor: PlaybackAnchor;
  createdAt: number;
}

export function isPlaybackAnchor(value: unknown): value is PlaybackAnchor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.position === "number" &&
    typeof candidate.isPlaying === "boolean" &&
    typeof candidate.serverTimestamp === "number"
  );
}
