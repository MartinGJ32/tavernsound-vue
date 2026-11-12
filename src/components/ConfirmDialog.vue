<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }>(),
  {
    confirmLabel: "Confirmar",
    cancelLabel: "Cancelar",
  },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      @click.self="emit('cancel')"
      @keydown.esc="emit('cancel')"
    >
      <div class="w-full max-w-sm rounded-sm border border-gold-dim/30 bg-parchment p-5 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
        <h2 class="font-display text-lg text-gold-2">{{ title }}</h2>
        <p class="mt-2 font-body text-sm text-text-2">{{ message }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-sm border border-gold-dim/35 px-4 py-2 font-heading text-xs tracking-[1.5px] text-text-2 uppercase transition-colors hover:border-gold-dim hover:text-gold-2"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="rounded-sm bg-linear-to-br from-ember to-ember-2 px-4 py-2 font-heading text-xs tracking-[1.5px] text-white uppercase transition-shadow hover:shadow-[0_0_10px_rgba(224,85,37,0.4)]"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
