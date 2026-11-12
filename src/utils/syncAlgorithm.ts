import type { PlaybackAnchor } from "@/types";

export const SMALL_DRIFT_THRESHOLD_SECONDS = 0.75;
export const LARGE_DRIFT_THRESHOLD_SECONDS = 3;
export const CATCH_UP_PLAYBACK_RATE = 1.06;
export const SLOW_DOWN_PLAYBACK_RATE = 0.94;
export const NORMAL_PLAYBACK_RATE = 1;

/**
 * Posición esperada del track en `nowMs`, a partir de un anchor del
 * servidor. No depende del reloj del cliente para saber "cuándo" pasó
 * algo — solo lo usa para medir cuánto tiempo transcurrió desde que llegó
 * el anchor, que es la parte que sí puede medir con confianza.
 */
export function calculateExpectedPosition(anchor: PlaybackAnchor, nowMs: number = Date.now()): number {
  const elapsedSeconds = anchor.isPlaying ? (nowMs - anchor.serverTimestamp) / 1000 : 0;
  return Math.max(0, anchor.position + elapsedSeconds);
}

export type SyncAction =
  | { type: "none" }
  | { type: "adjust-rate"; rate: number }
  | { type: "seek"; position: number };

/**
 * Decide cómo reconciliar la posición real del reproductor con la
 * esperada:
 *  - diferencia chica (< 0.75s): se ignora — es jitter normal, corregirla
 *    generaría más saltos de los que evita.
 *  - diferencia media (0.75s–3s): se ajusta ligeramente `playbackRate`
 *    para converger sin que se note un salto.
 *  - diferencia grande (> 3s): un cambio de velocidad tardaría demasiado
 *    en notarse — mejor un seek directo, aunque sea perceptible.
 */
export function decideSyncAction(expectedPosition: number, actualPosition: number): SyncAction {
  const diff = expectedPosition - actualPosition;
  const absDiff = Math.abs(diff);

  if (absDiff < SMALL_DRIFT_THRESHOLD_SECONDS) return { type: "none" };

  if (absDiff <= LARGE_DRIFT_THRESHOLD_SECONDS) {
    return { type: "adjust-rate", rate: diff > 0 ? CATCH_UP_PLAYBACK_RATE : SLOW_DOWN_PLAYBACK_RATE };
  }

  return { type: "seek", position: expectedPosition };
}
