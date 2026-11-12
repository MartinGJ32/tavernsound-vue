<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoomStore } from "@/stores/room";
import { sanitizeText, MAX_CHAT_MESSAGE_LENGTH } from "@/utils/validation";
import type { ChatMessage } from "@/types";
import { realtimeInjectionKey } from "@/composables/useRealtime";

const room = useRoomStore();
const injectedRealtime = inject(realtimeInjectionKey);
if (!injectedRealtime) {
  throw new Error("ChatPanel necesita un RoomView (o similar) como ancestro que provea useRealtime().");
}
const realtime = injectedRealtime;

const messages = ref<ChatMessage[]>([]);
const draft = ref("");
const listRef = ref<HTMLElement | null>(null);

/**
 * No agregamos el mensaje localmente al enviarlo: el servidor nos lo
 * reemite por el mismo canal con el que recibimos los de todos los demás
 * (ver server/socket.ts), así que agregarlo acá también lo duplicaría.
 * Un solo camino de entrada para todos los mensajes es más simple que
 * tener que deduplicar.
 */
const unsubscribe = realtime.onEvent((event) => {
  if (event.type === "CHAT_MESSAGE") messages.value.push(event.message);
});
onBeforeUnmount(unsubscribe);

function send() {
  const text = sanitizeText(draft.value, MAX_CHAT_MESSAGE_LENGTH);
  if (!text) return;

  realtime.sendChatMessage(text);
  draft.value = "";
}

watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
  },
);
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <h2 class="flex-shrink-0 font-heading text-xs tracking-[2px] text-gold-dim uppercase">Charla</h2>

    <div ref="listRef" class="my-3 flex-1 space-y-2 overflow-y-auto">
      <p v-if="messages.length === 0" class="font-body text-sm text-text-3 italic">
        Todavía nadie dijo nada. Rompé el hielo.
      </p>
      <p v-for="message in messages" :key="message.id" class="font-body text-sm leading-snug">
        <span
          class="font-heading text-[11px] tracking-wide"
          :class="message.userId === room.userId ? 'text-gold-2' : 'text-text-2'"
        >
          {{ message.userName }}:
        </span>
        <span class="text-text">{{ message.text }}</span>
      </p>
    </div>

    <form class="flex flex-shrink-0 gap-2" @submit.prevent="send">
      <input
        v-model="draft"
        type="text"
        placeholder="Escribí algo…"
        :maxlength="MAX_CHAT_MESSAGE_LENGTH"
        class="w-full rounded-sm border border-gold-dim/35 bg-black/45 px-3 py-2 font-body text-sm text-text placeholder:text-text-3 placeholder:italic focus:border-gold focus:shadow-[0_0_12px_rgba(200,150,50,0.2)] focus:outline-none"
      />
      <button
        type="submit"
        :disabled="!draft.trim()"
        class="flex-shrink-0 rounded-sm border border-gold-dim/35 px-3 py-2 font-heading text-xs tracking-[1.5px] text-text-2 uppercase transition-colors hover:border-gold-dim hover:text-gold-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Enviar
      </button>
    </form>
  </section>
</template>
