<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useRoomStore } from "@/stores/room";
import { MAX_USER_NAME_LENGTH } from "@/utils/validation";

const router = useRouter();
const room = useRoomStore();

const userName = ref("");
const joinCode = ref("");

const isLoading = ref(false);

async function createRoom() {
  if (!userName.value.trim()) return;
  isLoading.value = true;
  try {
    const code = await room.createRoom(userName.value);
    router.push({ name: "room", params: { code } });
  } catch {
    // El mensaje ya queda en room.errorMessage — se muestra abajo del form.
  } finally {
    isLoading.value = false;
  }
}

async function joinRoom() {
  const code = joinCode.value.trim().toUpperCase();
  if (!userName.value.trim() || !code) return;
  isLoading.value = true;
  try {
    await room.joinRoom(code, userName.value);
    router.push({ name: "room", params: { code } });
  } catch {
    // Idem: room.errorMessage ya tiene el detalle (ej. "la sala no existe").
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4">
    <div
      class="w-full max-w-sm rounded-sm border border-gold-dim/20 bg-parchment/60 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
    >
      <h1 class="font-display text-xl text-gold-2 [text-shadow:0_0_20px_rgba(230,180,60,0.3)]">
        Reuní a tus compañeros
      </h1>
      <p class="mt-1.5 font-body text-sm text-text-2">
        Creá una sala o unite con un código para escuchar música al mismo tiempo.
      </p>

      <label class="mt-6 block">
        <span class="font-heading text-[10px] tracking-[1.5px] text-text-3 uppercase">Tu nombre</span>
        <input
          v-model="userName"
          type="text"
          placeholder="¿Cómo te decimos?"
          :maxlength="MAX_USER_NAME_LENGTH"
          class="mt-1.5 w-full rounded-sm border border-gold-dim/35 bg-black/45 px-3 py-2 font-body text-sm text-text placeholder:text-text-3 placeholder:italic focus:border-gold focus:shadow-[0_0_12px_rgba(200,150,50,0.2)] focus:outline-none"
        />
      </label>

      <button
        type="button"
        :disabled="isLoading || !userName.trim()"
        class="mt-4 w-full rounded-sm bg-linear-to-br from-gold to-gold-dim px-4 py-2.5 font-heading text-xs tracking-[1.5px] text-[#1a0f00] uppercase transition-shadow hover:shadow-[0_0_10px_rgba(200,150,50,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
        @click="createRoom"
      >
        Crear una sala
      </button>

      <div class="my-4 flex items-center gap-3 text-text-3">
        <div class="h-px flex-1 bg-gold-dim/20" />
        <span class="font-heading text-[10px] tracking-[2px] uppercase">o</span>
        <div class="h-px flex-1 bg-gold-dim/20" />
      </div>

      <form class="flex gap-2" @submit.prevent="joinRoom">
        <input
          v-model="joinCode"
          type="text"
          placeholder="Código de sala"
          maxlength="6"
          class="w-full rounded-sm border border-gold-dim/35 bg-black/45 px-3 py-2 font-body text-sm tracking-[2px] text-text uppercase placeholder:text-text-3 placeholder:normal-case placeholder:italic placeholder:tracking-normal focus:border-gold focus:shadow-[0_0_12px_rgba(200,150,50,0.2)] focus:outline-none"
        />
        <button
          type="submit"
          :disabled="isLoading || !userName.trim() || !joinCode.trim()"
          class="flex-shrink-0 rounded-sm border border-gold-dim/35 px-4 py-2 font-heading text-xs tracking-[1.5px] text-text-2 uppercase transition-colors hover:border-gold-dim hover:text-gold-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Unirse
        </button>
      </form>

      <p v-if="room.errorMessage" class="mt-4 font-body text-sm text-ember-2" role="alert">
        {{ room.errorMessage }}
      </p>
    </div>
  </div>
</template>
