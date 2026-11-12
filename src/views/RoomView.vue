<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, provide, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useRoomStore } from "@/stores/room";
import { MAX_USER_NAME_LENGTH } from "@/utils/validation";
import { useRealtime, realtimeInjectionKey } from "@/composables/useRealtime";
import { clearRoomSession } from "@/services/roomSession";
import RoomHeader from "@/components/RoomHeader.vue";
import Queue from "@/components/Queue.vue";
import ChatPanel from "@/components/ChatPanel.vue";
import MusicPlayer from "@/components/MusicPlayer.vue";

const props = defineProps<{
  code: string;
}>();

const router = useRouter();
const room = useRoomStore();

const userName = ref("");
const isJoining = ref(false);

/**
 * Si venimos de Home, el store ya tiene esta sala y nuestro userId — no
 * hay nada más que hacer. Si no (alguien pegó el link, o refrescó la
 * página), `onMounted` de abajo primero intenta retomar una sesión
 * guardada (Fase 8); si no hay ninguna, recién ahí hace falta pedir el
 * nombre y unirse.
 */
const needsToJoin = computed(() => !room.hasJoined || room.room?.id !== props.code.toUpperCase());
const isLoadingInitialState = computed(() => room.status === "loading" && !room.room);
const roomNotFound = computed(() => room.status === "error" && !room.room);

// Una sola conexión de Socket.io para toda la sala, compartida con RoomHeader
// (estado de conexión, contador de oyentes) y ChatPanel (mandar/recibir
// mensajes) vía provide/inject en vez de pasarla por props a través de
// varios niveles.
const realtime = useRealtime();
provide(realtimeInjectionKey, realtime);

onMounted(async () => {
  if (!needsToJoin.value) return;

  const result = await room.resumeSession(props.code);
  if (result === "no-session") {
    // No había nada guardado (es la primera vez que esta pestaña entra a
    // esta sala): sigue el flujo normal — traer el estado público primero,
    // así si la sala no existe lo sabemos antes de pedir el nombre.
    room.peekRoom(props.code).catch(() => {
      // el mensaje ya queda en room.errorMessage
    });
  }
  // "resumed" → needsToJoin ya pasa a false solo, de forma reactiva.
  // "error" → room.status/errorMessage ya quedaron seteados por resumeSession.
});

// Se conecta al canal recién cuando ya somos alguien en la sala (tenemos
// userId) — no tiene sentido conectar mientras se muestra el form de
// "unirse". `applyRealtimeEvent` es lo que hace que un cambio que hizo
// OTRO cliente aparezca acá sin refrescar la página.
watch(
  () => (needsToJoin.value ? null : room.token),
  (token) => {
    if (!token || !room.userName) return;
    // connect() es sincrónico: Socket.io conecta en segundo plano y avisa
    // por sus propios eventos ("connect"/"disconnect"), que ya alimentan
    // `realtime.status` — no hay nada que esperar ni capturar acá.
    //
    // El callback se dispara en CADA conexión (la primera y cada
    // reconexión automática): volver a pedir el estado completo de la
    // sala asegura que no se pierda nada de lo que haya pasado durante un
    // corte — un evento en vivo que nunca llegó por estar desconectados
    // no se recupera solo con el próximo evento, necesita este refresh.
    realtime.connect(props.code, token, room.userName, () => {
      room.peekRoom(props.code).catch(() => {});
    });
  },
  { immediate: true },
);

const unsubscribeRoomEvents = realtime.onEvent((event) => {
  room.applyRealtimeEvent(event);
});
onBeforeUnmount(unsubscribeRoomEvents);

async function handleJoin() {
  if (!userName.value.trim()) return;
  isJoining.value = true;
  try {
    await room.joinRoom(props.code, userName.value);
  } catch {
    // room.errorMessage ya tiene el detalle
  } finally {
    isJoining.value = false;
  }
}

function backToHome() {
  realtime.disconnect();
  clearRoomSession(props.code);
  room.reset();
  router.push({ name: "home" });
}
</script>

<template>
  <div v-if="isLoadingInitialState" class="flex flex-1 items-center justify-center px-4 text-center">
    <p class="font-body text-sm text-text-2">Buscando la sala…</p>
  </div>

  <div v-else-if="roomNotFound" class="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
    <p class="font-heading text-[10px] tracking-[3px] text-gold-dim uppercase">Sala</p>
    <h1 class="font-display text-xl text-gold-2">{{ code }}</h1>
    <p class="max-w-sm font-body text-sm text-text-2">{{ room.errorMessage }}</p>
    <button
      type="button"
      class="mt-2 rounded-sm border border-gold-dim/35 px-4 py-2 font-heading text-xs tracking-[1.5px] text-text-2 uppercase transition-colors hover:border-gold-dim hover:text-gold-2"
      @click="backToHome"
    >
      Volver al inicio
    </button>
  </div>

  <div v-else-if="needsToJoin" class="flex flex-1 items-center justify-center px-4 text-center">
    <div class="w-full max-w-sm rounded-sm border border-gold-dim/20 bg-parchment/60 p-6 text-left shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
      <p class="font-heading text-[10px] tracking-[3px] text-gold-dim uppercase">Te invitaron a la sala</p>
      <h1 class="font-display text-2xl text-gold-2">{{ code }}</h1>

      <label class="mt-4 block">
        <span class="font-heading text-[10px] tracking-[1.5px] text-text-3 uppercase">Tu nombre</span>
        <input
          v-model="userName"
          type="text"
          placeholder="¿Cómo te decimos?"
          :maxlength="MAX_USER_NAME_LENGTH"
          class="mt-1.5 w-full rounded-sm border border-gold-dim/35 bg-black/45 px-3 py-2 font-body text-sm text-text placeholder:text-text-3 placeholder:italic focus:border-gold focus:shadow-[0_0_12px_rgba(200,150,50,0.2)] focus:outline-none"
          @keyup.enter="handleJoin"
        />
      </label>

      <button
        type="button"
        :disabled="isJoining || !userName.trim()"
        class="mt-4 w-full rounded-sm bg-linear-to-br from-gold to-gold-dim px-4 py-2.5 font-heading text-xs tracking-[1.5px] text-[#1a0f00] uppercase transition-shadow hover:shadow-[0_0_10px_rgba(200,150,50,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
        @click="handleJoin"
      >
        Entrar a la taberna
      </button>

      <p v-if="room.errorMessage" class="mt-3 font-body text-sm text-ember-2" role="alert">
        {{ room.errorMessage }}
      </p>
    </div>
  </div>

  <div v-else class="flex min-h-0 flex-1 flex-col">
    <RoomHeader :code="code" :is-host="room.isHost" :status="realtime.status.value" :listener-count="realtime.listenerCount.value" />

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_320px] lg:overflow-hidden">
      <div class="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
        <MusicPlayer />
        <Queue />
      </div>
      <div class="min-h-0 lg:overflow-y-auto">
        <ChatPanel />
      </div>
    </div>
  </div>
</template>
