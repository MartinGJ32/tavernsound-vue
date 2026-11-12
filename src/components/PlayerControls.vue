<script setup lang="ts">
import { usePlayerPreferences } from "@/composables/usePlayerPreferences";

const props = defineProps<{
  isPlaying: boolean;
  canControl: boolean;
  hasCurrentTrack: boolean;
  hasNext: boolean;
}>();

const emit = defineEmits<{
  "toggle-play": [];
  next: [];
}>();

// Compartido con MusicPlayer (mismo composable, mismo estado): al
// terminar un video, MusicPlayer necesita saber si tocaba repetirlo o
// elegir uno al azar de la cola en vez del primero.
const { shuffle, repeat, toggleShuffle, cycleRepeat } = usePlayerPreferences();

const disabledTitle = "Solo el anfitrión puede controlar la reproducción";
</script>

<template>
  <div class="flex items-center gap-3">
    <button
      type="button"
      :disabled="!props.canControl"
      :class="shuffle ? 'text-gold-2' : 'text-text-3'"
      :title="props.canControl ? 'Aleatorio' : disabledTitle"
      class="transition-colors hover:text-gold-2 disabled:cursor-not-allowed disabled:hover:text-text-3"
      @click="toggleShuffle"
    >
      🔀
    </button>

    <button
      type="button"
      disabled
      title="Todavía no disponible"
      class="text-text-3 opacity-40"
      aria-label="Anterior"
    >
      ⏮
    </button>

    <button
      type="button"
      :disabled="!props.canControl || !props.hasCurrentTrack"
      :title="props.canControl ? (props.isPlaying ? 'Pausar' : 'Reproducir') : disabledTitle"
      class="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-gold to-gold-dim text-[#1a0f00] transition-shadow hover:shadow-[0_0_10px_rgba(200,150,50,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
      @click="emit('toggle-play')"
    >
      {{ props.isPlaying ? "⏸" : "▶" }}
    </button>

    <button
      type="button"
      :disabled="!props.canControl || !props.hasNext"
      :title="props.canControl ? 'Siguiente' : disabledTitle"
      class="text-text-3 transition-colors hover:text-gold-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-text-3"
      aria-label="Siguiente"
      @click="emit('next')"
    >
      ⏭
    </button>

    <button
      type="button"
      :disabled="!props.canControl"
      :class="repeat === 'one' ? 'text-gold-2' : 'text-text-3'"
      :title="props.canControl ? 'Repetir' : disabledTitle"
      class="transition-colors hover:text-gold-2 disabled:cursor-not-allowed disabled:hover:text-text-3"
      @click="cycleRepeat"
    >
      🔁
    </button>
  </div>
</template>
