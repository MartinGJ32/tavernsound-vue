import { defineStore } from "pinia";
import type { RoomEvent, RoomState } from "@/types";
import * as roomApi from "@/services/roomApi";
import { clearRoomSession, loadRoomSession, saveRoomSession } from "@/services/roomSession";

type RoomStoreStatus = "idle" | "loading" | "error";

interface RoomStoreState {
  room: RoomState | null;
  /** Credencial secreta de este navegador. Nunca se muestra ni se manda a otros: solo va en `Authorization` y en el "join" del socket. */
  token: string | null;
  /** Identidad pública (derivada del token por el servidor). */
  userId: string | null;
  userName: string | null;
  status: RoomStoreStatus;
  errorMessage: string | null;
  /** Separado de `status`/`errorMessage`: esos dos son del flujo de entrar a la sala (Fase 3), y una falla al tocar la cola no debería pisar ese mensaje ni disparar la pantalla de "sala no encontrada". */
  queuePending: boolean;
  queueError: string | null;
}

export const useRoomStore = defineStore("room", {
  state: (): RoomStoreState => ({
    room: null,
    token: null,
    userId: null,
    userName: null,
    status: "idle",
    errorMessage: null,
    queuePending: false,
    queueError: null,
  }),

  getters: {
    /**
     * `isHost` compara contra el `hostId` que YA vino confirmado del
     * backend, nunca lo decide el cliente. Esto solo controla qué botones
     * mostrar — la autorización real vuelve a validarse server-side en
     * cada comando (ver HOST_ONLY_COMMANDS, Fase 2).
     */
    isHost: (state): boolean => Boolean(state.room && state.userId && state.room.hostId === state.userId),
    hasJoined: (state): boolean => Boolean(state.room && state.userId && state.token),
  },

  actions: {
    async createRoom(userName: string): Promise<string> {
      this.status = "loading";
      this.errorMessage = null;
      try {
        const response = await roomApi.createRoom({ userName });
        this.room = response.room;
        this.token = response.token;
        this.userId = response.userId;
        this.userName = userName;
        this.status = "idle";
        saveRoomSession(response.room.id, { token: response.token, userId: response.userId, userName });
        return response.room.id;
      } catch (err) {
        this.status = "error";
        this.errorMessage = roomApi.getErrorMessage(err);
        throw err;
      }
    },

    async joinRoom(code: string, userName: string): Promise<void> {
      this.status = "loading";
      this.errorMessage = null;
      try {
        const response = await roomApi.joinRoom(code, { userName });
        this.room = response.room;
        this.token = response.token;
        this.userId = response.userId;
        this.userName = userName;
        this.status = "idle";
        saveRoomSession(code, { token: response.token, userId: response.userId, userName });
      } catch (err) {
        this.status = "error";
        this.errorMessage = roomApi.getErrorMessage(err);
        throw err;
      }
    },

    /**
     * Solo trae el estado público de la sala, sin unirse (sin userId
     * nuevo). Sirve para, por ejemplo, mostrar un error temprano de "esta
     * sala no existe" antes de pedirle el nombre a la persona.
     */
    async peekRoom(code: string): Promise<void> {
      this.status = "loading";
      this.errorMessage = null;
      try {
        this.room = await roomApi.getRoom(code);
        this.status = "idle";
      } catch (err) {
        this.status = "error";
        this.errorMessage = roomApi.getErrorMessage(err);
        throw err;
      }
    },

    /**
     * Intenta retomar una sesión guardada (ver `services/roomSession.ts`)
     * en vez de unirse de cero. Esto es lo que evita que un refresh de
     * página te deje sin tu userId anterior — y, si eras el host, sin tu
     * rol de host: unirse de nuevo siempre asigna un userId nuevo, que ya
     * no coincidiría con `room.hostId` guardado en el servidor.
     *
     * Devuelve "no-session" cuando no hay nada guardado para este código
     * (quien llama debe seguir con el flujo normal de "unirse"),
     * "resumed" cuando se restauró con éxito, o "error" cuando había una
     * sesión guardada pero la sala ya no existe (y la limpia, para no
     * reintentar con un userId que ya no sirve).
     */
    async resumeSession(code: string): Promise<"resumed" | "no-session" | "error"> {
      const session = loadRoomSession(code);
      if (!session) return "no-session";

      this.status = "loading";
      this.errorMessage = null;
      try {
        this.room = await roomApi.getRoom(code);
        this.token = session.token;
        this.userId = session.userId;
        this.userName = session.userName;
        this.status = "idle";
        return "resumed";
      } catch (err) {
        this.status = "error";
        this.errorMessage = roomApi.getErrorMessage(err);
        clearRoomSession(code);
        return "error";
      }
    },

    /**
     * Las acciones de cola y reproducción comparten la misma forma:
     * mandan el token secreto (para que el backend valide que somos el
     * host — ver assertIsHost), y ante éxito reemplazan `room` entero con lo que
     * devuelve el servidor en vez de mutar el array localmente. Es más
     * tráfico, pero significa que el estado que ve la UI es siempre
     * exactamente el que quedó persistido, nunca una suposición optimista
     * que podría desincronizarse.
     */
    async addTrack(videoInput: string, title: string): Promise<void> {
      if (!this.token || !this.room) return;
      this.queuePending = true;
      this.queueError = null;
      try {
        this.room = await roomApi.addTrackToQueue(this.room.id, this.token, { videoInput, title });
      } catch (err) {
        this.queueError = roomApi.getErrorMessage(err);
        throw err;
      } finally {
        this.queuePending = false;
      }
    },

    async removeTrack(index: number): Promise<void> {
      if (!this.token || !this.room) return;
      this.queuePending = true;
      this.queueError = null;
      try {
        this.room = await roomApi.removeTrackFromQueue(this.room.id, this.token, index);
      } catch (err) {
        this.queueError = roomApi.getErrorMessage(err);
        throw err;
      } finally {
        this.queuePending = false;
      }
    },

    async reorderTrack(from: number, to: number): Promise<void> {
      if (!this.token || !this.room) return;
      this.queuePending = true;
      this.queueError = null;
      try {
        this.room = await roomApi.reorderQueue(this.room.id, this.token, from, to);
      } catch (err) {
        this.queueError = roomApi.getErrorMessage(err);
        throw err;
      } finally {
        this.queuePending = false;
      }
    },

    async clearQueue(): Promise<void> {
      if (!this.token || !this.room) return;
      this.queuePending = true;
      this.queueError = null;
      try {
        this.room = await roomApi.clearQueue(this.room.id, this.token);
      } catch (err) {
        this.queueError = roomApi.getErrorMessage(err);
        throw err;
      } finally {
        this.queuePending = false;
      }
    },

    async playTrackAt(index: number): Promise<void> {
      if (!this.token || !this.room) return;
      this.queuePending = true;
      this.queueError = null;
      try {
        this.room = await roomApi.playTrackAt(this.room.id, this.token, index);
      } catch (err) {
        this.queueError = roomApi.getErrorMessage(err);
        throw err;
      } finally {
        this.queuePending = false;
      }
    },

    async shuffleQueue(): Promise<void> {
      if (!this.token || !this.room) return;
      this.queuePending = true;
      this.queueError = null;
      try {
        this.room = await roomApi.shuffleQueue(this.room.id, this.token);
      } catch (err) {
        this.queueError = roomApi.getErrorMessage(err);
        throw err;
      } finally {
        this.queuePending = false;
      }
    },

    /**
     * Pausar y reanudar son la misma llamada con `isPlaying` distinto:
     * ambos casos necesitan mandar la posición actual del reproductor
     * real (MusicPlayer se la pasa) para que el nuevo anchor arranque
     * desde ahí, no desde 0.
     */
    async setPlaying(isPlaying: boolean, currentPosition: number): Promise<void> {
      if (!this.token || !this.room) return;
      this.queuePending = true;
      this.queueError = null;
      try {
        this.room = await roomApi.setPlaybackState(this.room.id, this.token, isPlaying, currentPosition);
      } catch (err) {
        this.queueError = roomApi.getErrorMessage(err);
        throw err;
      } finally {
        this.queuePending = false;
      }
    },

    async seek(position: number): Promise<void> {
      if (!this.token || !this.room) return;
      const isPlaying = this.room.anchor.isPlaying;
      this.queuePending = true;
      this.queueError = null;
      try {
        this.room = await roomApi.setPlaybackState(this.room.id, this.token, isPlaying, position);
      } catch (err) {
        this.queueError = roomApi.getErrorMessage(err);
        throw err;
      } finally {
        this.queuePending = false;
      }
    },

    /**
     * Aplica un evento que llegó por el canal de la sala (Fase 6) —
     * originado por CUALQUIER cliente, no necesariamente el nuestro. Es
     * lo que hace que un cambio que hizo otra persona se vea acá sin
     * tener que refrescar la página.
     *
     * A propósito NO valida autorización acá: para cuando un RoomEvent
     * llega por este canal, el backend ya lo autorizó antes de
     * publicarlo (ver `assertIsHost` en cada mutación) — este método solo
     * refleja localmente algo que ya pasó, no decide si podía pasar.
     */
    applyRealtimeEvent(event: RoomEvent): void {
      if (!this.room) return;

      switch (event.type) {
        case "PLAY":
        case "PAUSE":
        case "SEEK":
          this.room.anchor = event.anchor;
          break;
        case "TRACK_CHANGE":
          this.room.currentTrack = event.track;
          this.room.anchor = event.anchor;
          break;
        case "QUEUE_SYNC":
          this.room.queue = event.queue;
          break;
        case "HOST_CHANGED":
          this.room.hostId = event.hostId;
          break;
        case "CHAT_MESSAGE":
          // El chat no vive en RoomState — lo consume ChatPanel directo
          // desde su propia suscripción, no a través del store.
          break;
      }
    },

    reset(): void {
      this.room = null;
      this.token = null;
      this.userId = null;
      this.userName = null;
      this.status = "idle";
      this.errorMessage = null;
      this.queuePending = false;
      this.queueError = null;
    },
  },
});
