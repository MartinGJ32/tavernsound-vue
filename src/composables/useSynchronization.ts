import { onBeforeUnmount } from "vue";
import type { PlaybackAnchor } from "@/types";
import { NORMAL_PLAYBACK_RATE, calculateExpectedPosition, decideSyncAction } from "@/utils/syncAlgorithm";

export interface SynchronizablePlayer {
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
}

const RECONCILE_INTERVAL_MS = 1000;

/**
 * Corre `decideSyncAction` (ver `utils/syncAlgorithm.ts`) contra el
 * reproductor real cada un segundo. Separado en su propio composable en
 * vez de vivir dentro de `usePlayer` porque la sincronización es una
 * preocupación distinta: `usePlayer` sabe hablarle a YouTube, esto sabe
 * *cuándo* corregirlo.
 */
export function useSynchronization(player: SynchronizablePlayer, getAnchor: () => PlaybackAnchor | null) {
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let rateIsAdjusted = false;

  function reconcile(): void {
    const anchor = getAnchor();
    if (!anchor || !anchor.isPlaying) {
      if (rateIsAdjusted) {
        player.setPlaybackRate(NORMAL_PLAYBACK_RATE);
        rateIsAdjusted = false;
      }
      return;
    }

    const expected = calculateExpectedPosition(anchor);
    const actual = player.getCurrentTime();
    const action = decideSyncAction(expected, actual);

    switch (action.type) {
      case "none":
        if (rateIsAdjusted) {
          player.setPlaybackRate(NORMAL_PLAYBACK_RATE);
          rateIsAdjusted = false;
        }
        break;
      case "adjust-rate":
        player.setPlaybackRate(action.rate);
        rateIsAdjusted = true;
        break;
      case "seek":
        player.seekTo(action.position);
        player.setPlaybackRate(NORMAL_PLAYBACK_RATE);
        rateIsAdjusted = false;
        break;
    }
  }

  function start(): void {
    stop();
    intervalId = setInterval(reconcile, RECONCILE_INTERVAL_MS);
  }

  function stop(): void {
    if (intervalId) clearInterval(intervalId);
  }

  onBeforeUnmount(stop);

  return { start, stop, reconcile };
}
