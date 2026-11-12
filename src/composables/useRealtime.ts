import { io, type Socket } from "socket.io-client";
import { onBeforeUnmount, ref, type InjectionKey } from "vue";
import type { ConnectionStatus, RoomEvent } from "@/types";
import { ROOM_EVENT_NAME, parseRoomEvent } from "@/types";

export function useRealtime() {
  const status = ref<ConnectionStatus>("disconnected");
  const listenerCount = ref(1);

  let socket: Socket | null = null;
  const eventHandlers = new Set<(event: RoomEvent) => void>();

  /**
   * Sin argumentos, `io()` se conecta al mismo origen que sirvió la
   * página: en desarrollo eso es Vite, que proxea `/socket.io` hacia
   * `server/index.ts` (ver vite.config.ts); en producción es el mismo
   * proceso Express que sirve todo. El navegador nunca ve un origen
   * distinto, así que no hace falta CORS del lado del cliente.
   */
  function connect(code: string, token: string, userName: string, onConnected?: () => void): void {
    disconnect();
    status.value = "connecting";

    socket = io();

    // Se re-emite "join" en cada "connect" (no solo la primera vez): así,
    // si `socket.io-client` reconecta solo después de un corte —lo hace
    // por default—, el server vuelve a saber en qué sala estamos sin que
    // tengamos que detectar la reconexión a mano. `onConnected` sigue el
    // mismo criterio: quien llama lo usa típicamente para re-pedir el
    // estado completo de la sala, por si se perdió algún evento durante
    // el corte.
    socket.on("connect", () => {
      status.value = "connected";
      socket?.emit("join", { code, token, userName });
      onConnected?.();
    });

    socket.on("disconnect", () => {
      status.value = "reconnecting";
    });

    socket.on("connect_error", () => {
      status.value = "disconnected";
    });

    // El servidor rechazó el "join" (sala inexistente/expirada, o datos
    // inválidos): no tiene sentido seguir mostrándose como conectado.
    socket.on("joinError", () => {
      status.value = "disconnected";
    });

    socket.on(ROOM_EVENT_NAME, (data: unknown) => {
      const event = parseRoomEvent(data);
      if (!event) return;
      eventHandlers.forEach((handler) => handler(event));
    });

    socket.on("listenerCount", (count: number) => {
      if (typeof count === "number") listenerCount.value = count;
    });
  }

  /** Devuelve una función para des-suscribirse — mismo patrón que un `watch` de Vue, para que el componente no tenga que manejar el Set a mano. */
  function onEvent(handler: (event: RoomEvent) => void): () => void {
    eventHandlers.add(handler);
    return () => eventHandlers.delete(handler);
  }

  /**
   * Manda solo el texto: el servidor arma el ChatMessage completo (id,
   * sentAt, y sobre todo userId/userName, que ya conoce por el socket) y
   * lo reemite a todos, este cliente incluido. Que el remitente no pueda
   * mandar su propio userId/userName en el payload es intencional — se lo
   * pisaría el server igual, pero mejor que el cliente ni tenga la
   * posibilidad de intentarlo.
   */
  function sendChatMessage(text: string): void {
    socket?.emit("chatMessage", text);
  }

  function disconnect(): void {
    socket?.disconnect();
    socket = null;
    eventHandlers.clear();
  }

  onBeforeUnmount(disconnect);

  return { status, listenerCount, connect, disconnect, onEvent, sendChatMessage };
}

export type RealtimeConnection = ReturnType<typeof useRealtime>;
export const realtimeInjectionKey: InjectionKey<RealtimeConnection> = Symbol("realtime");
