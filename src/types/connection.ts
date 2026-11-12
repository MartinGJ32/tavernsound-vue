/**
 * Estado de la conexión realtime, tal como lo necesita mostrar la UI
 * (`ConnectionStatus.vue`, Fase 4) y calcular `useConnection` (Fase 6).
 * "reconnecting" existe como estado propio — distinto de "connecting" —
 * porque la UI debe comunicar algo distinto ("se cortó, reintentando")
 * en vez de la primera conexión.
 */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
