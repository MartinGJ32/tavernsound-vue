<script setup lang="ts">
import { ref } from "vue";
import { useRoomStore } from "@/stores/room";
import { useToast } from "@/composables/useToast";
import { extractYouTubeId } from "@/utils/validation";
import { fetchYouTubeTitle } from "@/services/youtubeMetadata";

const room = useRoomStore();
const toast = useToast();

const input = ref("");
const isSubmitting = ref(false);

async function handleSubmit() {
  const raw = input.value.trim();
  if (!raw) return;

  const videoId = extractYouTubeId(raw);
  if (!videoId) {
    toast.error("Ese link no parece ser de YouTube.");
    return;
  }

  isSubmitting.value = true;
  try {
    const title = await fetchYouTubeTitle(videoId);
    await room.addTrack(videoId, title);
    input.value = "";
  } catch {
    toast.error(room.queueError ?? "No se pudo agregar el video.");
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <form class="flex gap-2" @submit.prevent="handleSubmit">
    <input
      v-model="input"
      type="text"
      placeholder="Pegá un link de YouTube…"
      class="w-full rounded-sm border border-gold-dim/35 bg-black/45 px-3 py-2 font-body text-sm text-text placeholder:text-text-3 placeholder:italic focus:border-gold focus:shadow-[0_0_12px_rgba(200,150,50,0.2)] focus:outline-none"
    />
    <button
      type="submit"
      :disabled="isSubmitting || !input.trim()"
      class="flex-shrink-0 rounded-sm bg-linear-to-br from-gold to-gold-dim px-4 py-2 font-heading text-xs tracking-[1.5px] text-[#1a0f00] uppercase transition-shadow hover:shadow-[0_0_10px_rgba(200,150,50,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {{ isSubmitting ? "…" : "Agregar" }}
    </button>
  </form>
</template>
