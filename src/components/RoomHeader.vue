<script setup lang="ts">
import { useToast } from "@/composables/useToast";
import type { ConnectionStatus as ConnectionStatusType } from "@/types";
import ListenerCount from "./ListenerCount.vue";
import ConnectionStatus from "./ConnectionStatus.vue";

const props = defineProps<{
  code: string;
  isHost: boolean;
  status: ConnectionStatusType;
  listenerCount: number;
}>();

const toast = useToast();

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast.info("Enlace copiado");
  } catch {
    toast.error(`No se pudo copiar. El código es ${props.code}.`);
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gold-dim/20 px-4 py-2.5">
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-sm border border-gold-dim/35 px-2.5 py-1 font-heading text-xs tracking-[2px] text-gold-2 uppercase transition-colors hover:border-gold-dim"
        title="Copiar enlace de la sala"
        @click="copyLink"
      >
        {{ code }} ⧉
      </button>
      <span
        v-if="isHost"
        class="rounded-full border border-gold-dim/30 px-2 py-0.5 font-heading text-[10px] tracking-[1.5px] text-gold-2 uppercase"
      >
        Anfitrión
      </span>
    </div>

    <div class="flex items-center gap-3">
      <ListenerCount :count="listenerCount" />
      <ConnectionStatus :status="status" />
    </div>
  </div>
</template>
