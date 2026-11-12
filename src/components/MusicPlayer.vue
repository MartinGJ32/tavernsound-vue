<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoomStore } from "@/stores/room";
import { useToast } from "@/composables/useToast";
import { usePlayer } from "@/composables/usePlayer";
import { useSynchronization, type SynchronizablePlayer } from "@/composables/useSynchronization";
import { usePlayerPreferences } from "@/composables/usePlayerPreferences";
import { calculateExpectedPosition } from "@/utils/syncAlgorithm";
import ProgressBar from "./ProgressBar.vue";
import PlayerControls from "./PlayerControls.vue";
import VolumeControl from "./VolumeControl.vue";

const room = useRoomStore();
const toast = useToast();
const { shuffle, repeat } = usePlayerPreferences();

const yt = usePlayer();
const playerContainer = ref<HTMLElement | null>(null);

// Local a propósito, igual que en la app original: el volumen es una
// preferencia de cada oyente, no algo que se sincronice entre usuarios.
const volume = ref(80);
const isMuted = ref(false);

watch(volume, (value) => yt.setVolume(value));
watch(isMuted, (value) => yt.setMuted(value));

const currentTrack = computed(() => room.room?.currentTrack ?? null);
const isPlaying = computed(() => room.room?.anchor.isPlaying ?? false);
const hasNext = computed(() => (room.room?.queue.length ?? 0) > 0);

/**
 * Ventana corta para distinguir "este cambio de estado lo causamos
 * nosotros" (nuestros propios botones, o la corrección de deriva) de "esto
 * pasó solo" (el video terminó, o alguien clickeó directo sobre el
 * iframe — con `controls: 0` no hay controles nativos, pero el video en
 * sí sigue reaccionando a un click). Sin esto, cada seek de la
 * sincronización dispararía un evento que se interpretaría como una
 * acción externa a reportar, generando un loop.
 */
let ignoreStateChangeUntil = 0;
function markProgrammatic(): void {
  ignoreStateChangeUntil = Date.now() + 500;
}
function wasProgrammatic(): boolean {
  return Date.now() < ignoreStateChangeUntil;
}

const syncPlayer: SynchronizablePlayer = {
  getCurrentTime: yt.getCurrentTime,
  seekTo: (seconds) => {
    markProgrammatic();
    yt.seekTo(seconds);
  },
  setPlaybackRate: yt.setPlaybackRate,
};
const sync = useSynchronization(syncPlayer, () => room.room?.anchor ?? null);

/**
 * `useSynchronization` corrige la posición, pero deliberadamente no
 * decide play/pausa por su cuenta (ver sus comentarios). Este watcher es
 * el que faltaba: cuando `isPlaying` cambia —sea por nuestro propio botón
 * o porque le llegó un evento de otro cliente por Socket.io—, refleja eso en
 * el reproductor real. Llamar play()/pause() de más no es un problema:
 * son operaciones idempotentes para la IFrame API.
 */
watch(
  () => room.room?.anchor.isPlaying,
  (playing) => {
    if (playing === undefined || yt.readyState.value !== "ready") return;
    markProgrammatic();
    if (playing) yt.play();
    else yt.pause();
  },
);

function loadCurrentTrackIntoPlayer(): void {
  const track = room.room?.currentTrack;
  const anchor = room.room?.anchor;
  if (!track || !anchor || yt.readyState.value !== "ready") return;

  markProgrammatic();
  yt.loadVideo(track.id, calculateExpectedPosition(anchor));
  // loadVideoById siempre arranca reproduciendo — si el anchor dice que
  // está pausado, lo pausamos apenas después de cargarlo.
  if (!anchor.isPlaying) {
    setTimeout(() => {
      markProgrammatic();
      yt.pause();
    }, 300);
  }
}

onMounted(async () => {
  if (!playerContainer.value) return;
  await yt.attach(playerContainer.value, handlePlayerStateChange);
  yt.setVolume(volume.value);
  loadCurrentTrackIntoPlayer();
  sync.start();
});

watch(
  () => room.room?.currentTrack?.id,
  () => loadCurrentTrackIntoPlayer(),
);

async function handleTrackEnded() {
  if (!room.isHost) return; // el auto-avance lo decide el host, igual que cualquier otro cambio de reproducción

  if (repeat.value === "one") {
    markProgrammatic();
    yt.seekTo(0);
    yt.play();
    try {
      await room.setPlaying(true, 0);
    } catch {
      toast.error(room.queueError ?? "No se pudo reiniciar el video.");
    }
    return;
  }

  const queueLength = room.room?.queue.length ?? 0;
  if (queueLength === 0) {
    try {
      await room.setPlaying(false, yt.getCurrentTime());
    } catch {
      // sin cola y sin poder avisar al backend: no es grave, se resuelve solo en el próximo cambio de estado
    }
    return;
  }

  const nextIndex = shuffle.value ? Math.floor(Math.random() * queueLength) : 0;
  try {
    await room.playTrackAt(nextIndex);
  } catch {
    toast.error(room.queueError ?? "No se pudo pasar al siguiente video.");
  }
}

function handlePlayerStateChange(state: YT.PlayerState): void {
  if (state === YT.PlayerState.ENDED) {
    // Nunca es una acción "programática" nuestra (no existe un método
    // player.end()), así que el fin de un video siempre se maneja.
    void handleTrackEnded();
    return;
  }

  if (wasProgrammatic()) return; // ya sabíamos que esto iba a pasar, no hay nada nuevo que reportar

  if (!room.isHost) return; // un oyente no autoriza cambios aunque el navegador se lo permita a nivel de iframe

  if (state === YT.PlayerState.PLAYING) {
    room.setPlaying(true, yt.getCurrentTime()).catch(() => {
      toast.error(room.queueError ?? "No se pudo sincronizar la reproducción.");
    });
  } else if (state === YT.PlayerState.PAUSED) {
    room.setPlaying(false, yt.getCurrentTime()).catch(() => {
      toast.error(room.queueError ?? "No se pudo sincronizar la pausa.");
    });
  }
}

async function handleTogglePlay() {
  markProgrammatic();
  if (isPlaying.value) yt.pause();
  else yt.play();

  try {
    await room.setPlaying(!isPlaying.value, yt.getCurrentTime());
  } catch {
    toast.error(room.queueError ?? "No se pudo cambiar la reproducción.");
  }
}

async function handleNext() {
  try {
    await room.playTrackAt(0);
  } catch {
    toast.error(room.queueError ?? "No se pudo pasar al siguiente video.");
  }
}

async function handleSeek(seconds: number) {
  markProgrammatic();
  yt.seekTo(seconds);
  try {
    await room.seek(seconds);
  } catch {
    toast.error(room.queueError ?? "No se pudo mover la posición.");
  }
}
</script>

<template>
  <div class="rounded-sm border border-gold-dim/20 bg-parchment/60 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)] sm:p-4">
    <div class="relative aspect-video w-full overflow-hidden rounded-sm bg-black">
      <div ref="playerContainer" class="h-full w-full" />
      <div
        v-if="!currentTrack"
        class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85"
      >
        <span class="text-3xl text-text-3">♪</span>
        <p class="font-heading text-[10px] tracking-[2px] text-text-3 uppercase">Nada sonando todavía</p>
      </div>
    </div>

    <p v-if="currentTrack" class="mt-2.5 truncate font-body text-sm text-text">{{ currentTrack.title }}</p>

    <div class="mt-3 flex flex-col items-center gap-2">
      <PlayerControls
        :is-playing="isPlaying"
        :can-control="room.isHost"
        :has-current-track="currentTrack !== null"
        :has-next="hasNext"
        @toggle-play="handleTogglePlay"
        @next="handleNext"
      />
      <div class="flex w-full items-center gap-3">
        <div class="flex-1">
          <ProgressBar
            :position="yt.currentTime.value"
            :duration="yt.duration.value"
            :can-seek="room.isHost"
            @seek="handleSeek"
          />
        </div>
        <VolumeControl v-model:volume="volume" v-model:is-muted="isMuted" />
      </div>
    </div>
  </div>
</template>
