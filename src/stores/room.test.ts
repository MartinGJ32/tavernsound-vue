import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRoomStore } from "./room";
import type { RoomState } from "@/types";
import * as roomApi from "@/services/roomApi";
import * as roomSession from "@/services/roomSession";

// Mock parcial: RoomApiError y getErrorMessage son lógica pura que ya
// funciona bien sola — solo hace falta reemplazar las funciones que
// hacen fetch de verdad.
vi.mock("@/services/roomApi", async (importOriginal) => {
  const actual = await importOriginal<typeof roomApi>();
  return { ...actual, getRoom: vi.fn(), createRoom: vi.fn(), joinRoom: vi.fn(), addTrackToQueue: vi.fn() };
});
vi.mock("@/services/roomSession");

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    id: "ABC123",
    hostId: "host-1",
    currentTrack: null,
    queue: [],
    anchor: { position: 0, isPlaying: false, serverTimestamp: 1000 },
    createdAt: 1000,
    ...overrides,
  };
}

describe("useRoomStore.applyRealtimeEvent", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("no hace nada si todavía no hay una sala cargada", () => {
    const store = useRoomStore();
    expect(() => store.applyRealtimeEvent({ type: "PLAY", anchor: { position: 1, isPlaying: true, serverTimestamp: 1 } })).not.toThrow();
    expect(store.room).toBeNull();
  });

  it("PLAY/PAUSE/SEEK reemplazan el anchor", () => {
    const store = useRoomStore();
    store.room = makeRoom();

    const newAnchor = { position: 42, isPlaying: true, serverTimestamp: 5000 };
    store.applyRealtimeEvent({ type: "PLAY", anchor: newAnchor });

    expect(store.room.anchor).toEqual(newAnchor);
  });

  it("TRACK_CHANGE actualiza currentTrack y el anchor juntos", () => {
    const store = useRoomStore();
    store.room = makeRoom({ currentTrack: { id: "old", title: "Vieja", thumbnailUrl: "x" } });

    const track = { id: "new", title: "Nueva", thumbnailUrl: "y" };
    const anchor = { position: 0, isPlaying: true, serverTimestamp: 9000 };
    store.applyRealtimeEvent({ type: "TRACK_CHANGE", track, anchor });

    expect(store.room.currentTrack).toEqual(track);
    expect(store.room.anchor).toEqual(anchor);
  });

  it("QUEUE_SYNC reemplaza la cola completa", () => {
    const store = useRoomStore();
    store.room = makeRoom({ queue: [{ id: "a", title: "A", thumbnailUrl: "x" }] });

    const newQueue = [
      { id: "b", title: "B", thumbnailUrl: "x" },
      { id: "c", title: "C", thumbnailUrl: "x" },
    ];
    store.applyRealtimeEvent({ type: "QUEUE_SYNC", queue: newQueue });

    expect(store.room.queue).toEqual(newQueue);
  });

  it("HOST_CHANGED actualiza hostId (y por lo tanto isHost)", () => {
    const store = useRoomStore();
    store.room = makeRoom({ hostId: "host-1" });
    store.userId = "host-2";

    expect(store.isHost).toBe(false);
    store.applyRealtimeEvent({ type: "HOST_CHANGED", hostId: "host-2", hostName: "Frodo" });
    expect(store.room.hostId).toBe("host-2");
    expect(store.isHost).toBe(true);
  });

  it("CHAT_MESSAGE no toca el RoomState (lo consume ChatPanel aparte)", () => {
    const store = useRoomStore();
    const room = makeRoom();
    store.room = room;

    store.applyRealtimeEvent({
      type: "CHAT_MESSAGE",
      message: { id: "1", userId: "u1", userName: "Sam", text: "hola", sentAt: 1 },
    });

    expect(store.room).toEqual(room);
  });
});

describe("useRoomStore.resumeSession", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("devuelve 'no-session' sin tocar el estado si no hay nada guardado", async () => {
    vi.mocked(roomSession.loadRoomSession).mockReturnValue(null);
    const store = useRoomStore();

    const result = await store.resumeSession("ABC123");

    expect(result).toBe("no-session");
    expect(store.room).toBeNull();
    expect(roomApi.getRoom).not.toHaveBeenCalled();
  });

  it("restaura el mismo userId guardado — no uno nuevo — para no perder el rol de host", async () => {
    vi.mocked(roomSession.loadRoomSession).mockReturnValue({ token: "tok-host", userId: "host-1", userName: "Gandalf" });
    const room = makeRoom({ hostId: "host-1" });
    vi.mocked(roomApi.getRoom).mockResolvedValue(room);
    const store = useRoomStore();

    const result = await store.resumeSession("ABC123");

    expect(result).toBe("resumed");
    expect(store.token).toBe("tok-host");
    expect(store.userId).toBe("host-1");
    expect(store.userName).toBe("Gandalf");
    expect(store.room).toEqual(room);
    expect(store.isHost).toBe(true); // justamente lo que se perdería si esto asignara un userId nuevo
  });

  it("si la sala ya no existe, devuelve 'error' y limpia la sesión guardada", async () => {
    vi.mocked(roomSession.loadRoomSession).mockReturnValue({ token: "tok-host", userId: "host-1", userName: "Gandalf" });
    vi.mocked(roomApi.getRoom).mockRejectedValue(new roomApi.RoomApiError({ code: "ROOM_NOT_FOUND", message: "no existe" }));
    const store = useRoomStore();

    const result = await store.resumeSession("ABC123");

    expect(result).toBe("error");
    expect(store.errorMessage).toBe("no existe");
    expect(roomSession.clearRoomSession).toHaveBeenCalledWith("ABC123");
  });
});

describe("useRoomStore: credencial de las mutaciones", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("las mutaciones mandan el token secreto, no el userId público", async () => {
    const room = makeRoom();
    vi.mocked(roomApi.addTrackToQueue).mockResolvedValue(room);
    const store = useRoomStore();
    store.room = room;
    store.token = "tok-secreto";
    store.userId = "id-publico";

    await store.addTrack("dQw4w9WgXcQ", "Titulo");

    expect(roomApi.addTrackToQueue).toHaveBeenCalledWith("ABC123", "tok-secreto", {
      videoInput: "dQw4w9WgXcQ",
      title: "Titulo",
    });
  });

  it("sin token no se intenta ninguna mutación", async () => {
    const store = useRoomStore();
    store.room = makeRoom();
    store.userId = "id-publico"; // hay identidad pública pero no credencial

    await store.addTrack("dQw4w9WgXcQ", "Titulo");

    expect(roomApi.addTrackToQueue).not.toHaveBeenCalled();
  });
});
