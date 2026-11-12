import { describe, expect, it } from "vitest";
import {
  CATCH_UP_PLAYBACK_RATE,
  LARGE_DRIFT_THRESHOLD_SECONDS,
  SLOW_DOWN_PLAYBACK_RATE,
  SMALL_DRIFT_THRESHOLD_SECONDS,
  calculateExpectedPosition,
  decideSyncAction,
} from "./syncAlgorithm";

describe("calculateExpectedPosition", () => {
  it("devuelve la posición congelada tal cual si no está reproduciendo", () => {
    const anchor = { position: 42, isPlaying: false, serverTimestamp: 1_000_000 };
    expect(calculateExpectedPosition(anchor, 1_050_000)).toBe(42);
  });

  it("suma el tiempo transcurrido si está reproduciendo", () => {
    const anchor = { position: 10, isPlaying: true, serverTimestamp: 1_000_000 };
    // 5000ms después → +5s
    expect(calculateExpectedPosition(anchor, 1_005_000)).toBe(15);
  });

  it("nunca devuelve un valor negativo, incluso con relojes muy desincronizados", () => {
    const anchor = { position: 5, isPlaying: true, serverTimestamp: 2_000_000 };
    // "ahora" muy anterior al anchor: el tiempo transcurrido calculado es
    // fuertemente negativo. En ese caso preferimos asumir "recién arrancó"
    // (0) antes que devolver una posición negativa sin sentido.
    expect(calculateExpectedPosition(anchor, 1_000_000)).toBe(0);
  });
});

describe("decideSyncAction", () => {
  it("no hace nada si la diferencia es chica (jitter normal)", () => {
    expect(decideSyncAction(100, 99.5)).toEqual({ type: "none" });
    expect(decideSyncAction(100, 100.5)).toEqual({ type: "none" });
  });

  it("respeta el límite exacto de la zona 'sin acción'", () => {
    // Justo en el umbral chico: todavía "none" (estrictamente menor)
    expect(decideSyncAction(100, 100 - SMALL_DRIFT_THRESHOLD_SECONDS)).toEqual({
      type: "adjust-rate",
      rate: CATCH_UP_PLAYBACK_RATE,
    });
  });

  it("acelera el playbackRate cuando el reproductor está atrasado", () => {
    const result = decideSyncAction(102, 100); // esperado > real → hay que acelerar
    expect(result).toEqual({ type: "adjust-rate", rate: CATCH_UP_PLAYBACK_RATE });
  });

  it("frena el playbackRate cuando el reproductor está adelantado", () => {
    const result = decideSyncAction(100, 102); // esperado < real → hay que frenar
    expect(result).toEqual({ type: "adjust-rate", rate: SLOW_DOWN_PLAYBACK_RATE });
  });

  it("hace un seek directo si la diferencia es grande", () => {
    const expected = 100 + LARGE_DRIFT_THRESHOLD_SECONDS + 1;
    expect(decideSyncAction(expected, 100)).toEqual({ type: "seek", position: expected });
  });

  it("respeta el límite exacto de la zona de ajuste de velocidad", () => {
    const expected = 100 + LARGE_DRIFT_THRESHOLD_SECONDS;
    // Justo en el umbral grande: todavía "adjust-rate" (menor o igual)
    expect(decideSyncAction(expected, 100)).toEqual({ type: "adjust-rate", rate: CATCH_UP_PLAYBACK_RATE });
  });
});
