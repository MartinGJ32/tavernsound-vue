<script setup lang="ts">
import type { Track } from "@/types";

defineProps<{
  track: Track;
  position: number;
  isHost: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}>();

const emit = defineEmits<{
  remove: [];
  "move-up": [];
  "move-down": [];
  "play-now": [];
}>();
</script>

<template>
  <li class="flex items-center gap-3 rounded-sm border border-gold-dim/15 bg-black/25 p-2">
    <span class="w-5 flex-shrink-0 text-center font-heading text-xs text-text-3">{{ position }}</span>

    <img :src="track.thumbnailUrl" :alt="track.title" class="h-10 w-16 flex-shrink-0 rounded-sm object-cover" />

    <span class="min-w-0 flex-1 truncate font-body text-sm text-text">{{ track.title }}</span>

    <div v-if="isHost" class="flex flex-shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label="Reproducir ahora"
        class="rounded-sm p-1 text-text-3 transition-colors hover:text-gold-2"
        @click="emit('play-now')"
      >
        ▶
      </button>
      <button
        type="button"
        :disabled="!canMoveUp"
        aria-label="Mover arriba"
        class="rounded-sm p-1 text-text-3 transition-colors hover:text-gold-2 disabled:cursor-not-allowed disabled:opacity-30"
        @click="emit('move-up')"
      >
        ▲
      </button>
      <button
        type="button"
        :disabled="!canMoveDown"
        aria-label="Mover abajo"
        class="rounded-sm p-1 text-text-3 transition-colors hover:text-gold-2 disabled:cursor-not-allowed disabled:opacity-30"
        @click="emit('move-down')"
      >
        ▼
      </button>
      <button
        type="button"
        aria-label="Quitar de la cola"
        class="rounded-sm p-1 text-text-3 transition-colors hover:text-ember-2"
        @click="emit('remove')"
      >
        ✕
      </button>
    </div>
  </li>
</template>
