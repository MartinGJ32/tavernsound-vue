<script setup lang="ts">
import { computed } from "vue";
import type { ConnectionStatus } from "@/types";

const props = withDefaults(defineProps<{ status?: ConnectionStatus }>(), {
  status: "connected",
});

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "Conectando…",
  connected: "Conectado",
  reconnecting: "Reconectando…",
  disconnected: "Desconectado",
};

const DOT_CLASSES: Record<ConnectionStatus, string> = {
  connecting: "bg-gold-2 animate-pulse",
  connected: "bg-gold-2",
  reconnecting: "bg-ember-2 animate-pulse",
  disconnected: "bg-text-3",
};

const label = computed(() => LABELS[props.status]);
const dotClass = computed(() => DOT_CLASSES[props.status]);
</script>

<template>
  <span class="flex items-center gap-1.5 font-heading text-[10px] tracking-[1.5px] text-text-3 uppercase">
    <span class="h-1.5 w-1.5 rounded-full" :class="dotClass" />
    {{ label }}
  </span>
</template>
