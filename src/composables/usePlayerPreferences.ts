import { reactive, toRefs } from "vue";

export type RepeatMode = "off" | "one";

/**
 * Estado a nivel de módulo, local a este cliente — igual que el volumen,
 * shuffle/repeat son una preferencia de quien escucha, no algo que viva
 * en el RoomState compartido. Se define en un solo lugar para que
 * PlayerControls (que los muestra y los togglea) y MusicPlayer (que los
 * lee para decidir qué sigue al terminar un video) no dupliquen estado.
 */
const state = reactive({
  shuffle: false,
  repeat: "off" as RepeatMode,
});

export function usePlayerPreferences() {
  function toggleShuffle(): void {
    state.shuffle = !state.shuffle;
  }

  function cycleRepeat(): void {
    state.repeat = state.repeat === "off" ? "one" : "off";
  }

  return {
    ...toRefs(state),
    toggleShuffle,
    cycleRepeat,
  };
}
