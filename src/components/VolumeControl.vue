<script setup lang="ts">
defineProps<{
  volume: number;
  isMuted: boolean;
}>();

const emit = defineEmits<{
  "update:volume": [value: number];
  "update:isMuted": [value: boolean];
}>();
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      type="button"
      :aria-label="isMuted ? 'Activar sonido' : 'Silenciar'"
      class="text-text-3 transition-colors hover:text-gold-2"
      @click="emit('update:isMuted', !isMuted)"
    >
      {{ isMuted || volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊" }}
    </button>
    <input
      type="range"
      min="0"
      max="100"
      :value="volume"
      :disabled="isMuted"
      class="h-1 w-20 accent-[color:var(--color-gold)] disabled:opacity-40"
      @input="emit('update:volume', Number(($event.target as HTMLInputElement).value))"
    />
  </div>
</template>
