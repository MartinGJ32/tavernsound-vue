/**
 * Acciones que un cliente le pide al backend.
 *
 * A diferencia de RoomEvent (que el backend transmite a todos), un
 * RoomCommand nunca se publica directo al canal realtime: siempre pasa
 * primero por una función serverless que valida el permiso contra el
 * RoomState guardado en Redis, y recién ahí genera el RoomEvent
 * correspondiente. El cliente nunca decide por sí mismo si una acción es
 * válida — eso vive acá como contrato, y se aplica de verdad en el
 * backend (Fase 6).
 */
export type RoomCommand =
  | { type: "PLAY"; position: number }
  | { type: "PAUSE"; position: number }
  | { type: "SEEK"; position: number }
  | { type: "TRACK_CHANGE"; trackId: string }
  | { type: "QUEUE_ADD"; videoId: string }
  | { type: "QUEUE_REMOVE"; trackId: string }
  | { type: "QUEUE_REORDER"; from: number; to: number }
  | { type: "QUEUE_CLEAR" }
  | { type: "CHAT_SEND"; text: string };

/**
 * Comandos que exigen ser el host de la sala.
 *
 * A diferencia de la app original —donde cualquiera podía tocar la cola—,
 * acá la cola queda restringida al host, igual que el resto del control de
 * reproducción. CHAT_SEND queda afuera a propósito: charlar sigue siendo
 * libre para cualquiera en la sala.
 *
 * Se define como un solo Set en vez de repetir la lista en cada función de
 * la API, para que el backend (Fase 6) y cualquier chequeo optimista de UI
 * (deshabilitar un botón, nunca como autorización real) lean de la misma
 * fuente.
 */
export const HOST_ONLY_COMMANDS: ReadonlySet<RoomCommand["type"]> = new Set([
  "PLAY",
  "PAUSE",
  "SEEK",
  "TRACK_CHANGE",
  "QUEUE_ADD",
  "QUEUE_REMOVE",
  "QUEUE_REORDER",
  "QUEUE_CLEAR",
]);

export function isHostOnlyCommand(type: RoomCommand["type"]): boolean {
  return HOST_ONLY_COMMANDS.has(type);
}
