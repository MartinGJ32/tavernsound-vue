<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoomStore } from "@/stores/room";
import { useToast } from "@/composables/useToast";
import TrackItem from "./TrackItem.vue";
import AddTrackForm from "./AddTrackForm.vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const room = useRoomStore();
const toast = useToast();

const queue = computed(() => room.room?.queue ?? []);
const showClearConfirm = ref(false);

async function handleRemove(index: number) {
  try {
    await room.removeTrack(index);
  } catch {
    toast.error(room.queueError ?? "No se pudo quitar el video.");
  }
}

async function handleMove(index: number, direction: -1 | 1) {
  try {
    await room.reorderTrack(index, index + direction);
  } catch {
    toast.error(room.queueError ?? "No se pudo reordenar la cola.");
  }
}

async function handlePlayNow(index: number) {
  try {
    await room.playTrackAt(index);
  } catch {
    toast.error(room.queueError ?? "No se pudo reproducir ese video.");
  }
}

async function handleShuffle() {
  try {
    await room.shuffleQueue();
  } catch {
    toast.error(room.queueError ?? "No se pudo mezclar la cola.");
  }
}

async function confirmClear() {
  showClearConfirm.value = false;
  try {
    await room.clearQueue();
  } catch {
    toast.error(room.queueError ?? "No se pudo vaciar la cola.");
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2 class="font-heading text-xs tracking-[2px] text-gold-dim uppercase">
        Cola <span class="text-text-3">({{ queue.length }})</span>
      </h2>
      <div v-if="room.isHost && queue.length > 0" class="flex gap-3">
        <button
          type="button"
          :disabled="queue.length < 2"
          class="font-heading text-[10px] tracking-[1.5px] text-text-3 uppercase transition-colors hover:text-gold-2 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-text-3"
          @click="handleShuffle"
        >
          Mezclar
        </button>
        <button
          type="button"
          class="font-heading text-[10px] tracking-[1.5px] text-text-3 uppercase transition-colors hover:text-ember-2"
          @click="showClearConfirm = true"
        >
          Vaciar
        </button>
      </div>
    </div>

    <AddTrackForm v-if="room.isHost" />

    <p v-if="queue.length === 0" class="rounded-sm border border-dashed border-gold-dim/25 p-4 text-center font-body text-sm text-text-3">
      {{ room.isHost ? "La cola está vacía. Agregá el primer video." : "La cola está vacía por ahora." }}
    </p>

    <ul v-else class="flex flex-col gap-2">
      <TrackItem
        v-for="(track, index) in queue"
        :key="`${track.id}-${index}`"
        :track="track"
        :position="index + 1"
        :is-host="room.isHost"
        :can-move-up="index > 0"
        :can-move-down="index < queue.length - 1"
        @remove="handleRemove(index)"
        @move-up="handleMove(index, -1)"
        @move-down="handleMove(index, 1)"
        @play-now="handlePlayNow(index)"
      />
    </ul>

    <ConfirmDialog
      :open="showClearConfirm"
      title="¿Vaciar la cola?"
      message="Se van a quitar todos los videos pendientes. Lo que está sonando ahora no se ve afectado."
      confirm-label="Vaciar"
      @confirm="confirmClear"
      @cancel="showClearConfirm = false"
    />
  </section>
</template>
