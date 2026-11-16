import { onBeforeUnmount, shallowRef, ref } from "vue";

let pendingVolume = 80;

/**
 * @types/youtube declara el namespace ambiental `YT`, pero no amplía
 * `Window` con las dos globales que la propia YouTube IFrame API espera
 * encontrar (`YT` una vez cargada, y el callback que ella misma invoca
 * cuando termina de cargar). Se declara acá porque es este módulo el que
 * las usa.
 */
declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<void> | null = null;

/**
 * Carga el script de la IFrame API una sola vez por sesión de página,
 * sin importar cuántas veces se monte/desmonte MusicPlayer (por ejemplo,
 * al navegar entre salas). Si otro script ya definió su propio
 * `onYouTubeIframeAPIReady`, lo encadena en vez de pisarlo.
 */
function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });

  return apiLoadPromise;
}

export type PlayerReadyState = "loading" | "ready" | "error";

/**
 * Envuelve la YouTube IFrame API en una interfaz reactiva de Vue.
 *
 * Deliberadamente no intenta ser un composable "genérico" para cualquier
 * proveedor de video: está pensado específicamente para cómo esta app usa
 * YouTube (sin controles nativos — los controles son los de
 * `PlayerControls.vue` — y con polling simple para leer el tiempo actual,
 * ya que la IFrame API no emite un evento de "progreso").
 */
export function usePlayer() {
  const readyState = ref<PlayerReadyState>("loading");
  const currentTime = ref(0);
  const duration = ref(0);
  const playerState = ref<YT.PlayerState>(-1 as YT.PlayerState); // UNSTARTED

  const player = shallowRef<YT.Player | null>(null);
  let pollIntervalId: ReturnType<typeof setInterval> | undefined;

  function startPolling(): void {
    stopPolling();
    pollIntervalId = setInterval(() => {
      if (!player.value) return;
      try {
        currentTime.value = player.value.getCurrentTime();
        duration.value = player.value.getDuration();
      } catch {
        // El player puede estar entre estados (cargando un nuevo video).
        // Se ignora: el próximo tick lo resuelve solo.
      }
    }, 500);
  }

  function stopPolling(): void {
    if (pollIntervalId) clearInterval(pollIntervalId);
  }

  /**
   * Crea el reproductor real dentro de `target`. `onStateChange` es
   * responsabilidad de quien llama (MusicPlayer decide qué hacer con
   * play/pausa/fin de video — este composable solo expone el evento).
   */
  async function attach(
    target: HTMLElement,
    onStateChange: (state: YT.PlayerState) => void,
    videoId: string,
  ): Promise<void> {
    try {
      await loadYouTubeIframeApi();
    } catch (error) {
      readyState.value = "error";
      throw error;
    }

    if (!window.YT) {
      readyState.value = "error";
      throw new Error("YouTube IFrame API no disponible");
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      readyState.value = "error";
      throw new Error('ID de YouTube inválido: ${ videoId }');
    }

    readyState.value = "loading";

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      player.value = new window.YT!.Player(target, {
        height: "100%",
        width: "100%",
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            player.value = event.target;
            readyState.value = "ready";
            event.target.setVolume(pendingVolume);
            startPolling();

            if (!settled) {
              settled = true;
              resolve();
            }
          },
          onStateChange: (event) => {
            playerState.value = event.data;
            onStateChange(event.data);
          },
          onError: (event) => {
            console.error("Error de YouTube IFrame API:", event.data);
            readyState.value = "error";

            if (!settled) {
              settled = true;
              reject(new Error('YouTube devolvió el error ${ event.data }'));
            }
          },
        },
      });
    });
  }

  function loadVideo(videoId: string, startSeconds = 0): void {
    player.value?.loadVideoById({ videoId, startSeconds });
  }

  function play(): void {
    player.value?.playVideo();
  }

  function pause(): void {
    player.value?.pauseVideo();
  }

  function seekTo(seconds: number): void {
    player.value?.seekTo(seconds, true);
  }

  function setPlaybackRate(rate: number): void {
    player.value?.setPlaybackRate(rate);
  }

  function setVolume(volume: number): void {
    // Guardamos siempre el último volumen solicitado.
    pendingVolume = Math.max(0, Math.min(100, Math.round(volume)));

    // Todavía no podemos operar sobre el reproductor.
    if (readyState.value !== "ready") return;

    const currentPlayer = player.value;

    if (!currentPlayer || typeof currentPlayer.setVolume !== "function") {
      console.error("YouTube Player no tiene disponible setVolume:", currentPlayer);
      return;
    }

    currentPlayer.setVolume(pendingVolume);
  }

  function setMuted(muted: boolean): void {
    if (muted) player.value?.mute();
    else player.value?.unMute();
  }

  /** Lectura inmediata (sin esperar al próximo tick del polling) — la necesita la corrección de deriva. */
  function getCurrentTime(): number {
    try {
      return player.value?.getCurrentTime() ?? 0;
    } catch {
      return 0;
    }
  }

  onBeforeUnmount(() => {
    stopPolling();
    player.value?.destroy();
    player.value = null;
  });

  return {
    readyState,
    currentTime,
    duration,
    playerState,
    attach,
    loadVideo,
    play,
    pause,
    seekTo,
    setPlaybackRate,
    setVolume,
    setMuted,
    getCurrentTime,
  };
}
