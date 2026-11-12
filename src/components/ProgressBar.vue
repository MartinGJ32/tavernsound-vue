<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  position: number;
  duration: number;
  canSeek: boolean;
}>();

const emit = defineEmits<{
  seek: [seconds: number];
}>();

function formatTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const elapsedLabel = computed(() => formatTime(props.position));
const durationLabel = computed(() => formatTime(props.duration));

// La duración tarda un instante en llegar después de cargar un video
// nuevo (depende de que YouTube termine de bufferear lo suficiente) —
// mientras tanto no hay de qué calcular un porcentaje real.
const hasKnownDuration = computed(() => props.duration > 0);
const fillPercent = computed(() => (hasKnownDuration.value ? Math.min(100, (props.position / props.duration) * 100) : 0));

function handleClick(event: MouseEvent): void {
  if (!props.canSeek || !hasKnownDuration.value) return;
  const bar = event.currentTarget as HTMLElement;
  const rect = bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  emit("seek", ratio * props.duration);
}
</script>

<template>
  <div class="flex items-center gap-2">
    <span class="w-10 flex-shrink-0 text-right font-heading text-[10px] text-text-3">{{ elapsedLabel }}</span>
    <div
      class="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40"
      :class="canSeek && hasKnownDuration ? 'cursor-pointer' : ''"
      @click="handleClick"
    >
      <div class="h-full rounded-full bg-linear-to-r from-gold-dim to-gold-2" :style="{ width: `${fillPercent}%` }" />
    </div>
    <span class="w-10 flex-shrink-0 font-heading text-[10px] text-text-3">{{ durationLabel }}</span>
  </div>
</template>
