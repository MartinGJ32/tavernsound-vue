<script setup lang="ts">
import { useToast } from "@/composables/useToast";

const { toasts } = useToast();
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto rounded-sm border px-4 py-2 font-body text-sm shadow-[0_6px_20px_rgba(0,0,0,0.5)]"
        :class="
          toast.tone === 'error'
            ? 'border-ember/40 bg-[#2a1008] text-[#ffb08a]'
            : 'border-gold-dim/40 bg-parchment text-text'
        "
      >
        {{ toast.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
