import { beforeEach, describe, expect, it } from "vitest";
import { generateToken } from "./auth";
import { createMemoryRoomStore } from "./memoryRoomStore";
import type { RoomStore } from "./roomStore";
import { addTrackToQueue, assertIsHost, clearQueue, createRoom, joinRoom, playTrackAt, removeTrackFromQueue, reorderQueue, setPlaybackState, shuffleQueue } from "./roomService";

describe("roomService", () => {
  let store: RoomStore;

  beforeEach(() => {
    // Store en memoria fresco por test: nada de estado compartido entre
    // casos, y sin tocar Redis para nada de esto.
    store = createMemoryRoomStore();
  });

  describe("createRoom", () => {
    it("crea una sala con el creador como host y la cola vacía", async () => {
      const result = await createRoom({ hostName: "Gandalf" }, store);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.room.hostId).toBe(result.value.hostUserId);
      expect(result.value.room.queue).toEqual([]);
      expect(result.value.room.currentTrack).toBeNull();
      expect(result.value.room.id).toHaveLength(6);
    });

    it("rechaza un nombre vacío", async () => {
      const result = await createRoom({ hostName: "   " }, store);
      expect(result).toEqual({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "El nombre no puede estar vacío." },
      });
    });
  });

  describe("joinRoom", () => {
    it("une a un segundo usuario sin cambiar quién es el host", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      const joined = await joinRoom({ code: created.value.room.id, userName: "Frodo" }, store);

      expect(joined.ok).toBe(true);
      if (!joined.ok) return;
      expect(joined.value.room.hostId).toBe(created.value.hostUserId);
      expect(joined.value.userId).not.toBe(created.value.hostUserId);
    });

    it("devuelve ROOM_NOT_FOUND para un código que no existe", async () => {
      const result = await joinRoom({ code: "ZZZZZZ", userName: "Frodo" }, store);
      expect(result).toEqual({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
    });

    it("es insensible a mayúsculas/minúsculas en el código", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      const joined = await joinRoom({ code: created.value.room.id.toLowerCase(), userName: "Frodo" }, store);
      expect(joined.ok).toBe(true);
    });
  });

  describe("assertIsHost", () => {
    it("aprueba al host y rechaza a cualquier otro id", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      expect(assertIsHost(created.value.room, created.value.hostToken)).toEqual({ ok: true, value: true });
      expect(assertIsHost(created.value.room, generateToken())).toEqual({
        ok: false,
        error: { code: "NOT_HOST" },
      });
    });
  });

  describe("el hostId público NO es una credencial (regresión de un exploit real)", () => {
    it("usar el hostId visible en el estado de la sala como si fuera el token falla", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      // Esto es exactamente lo que podía hacer cualquiera que conociera el
      // código de sala: leer `hostId` del estado público y usarlo para
      // autenticarse. Tiene formato válido de token, pero no es el token.
      const stolen = created.value.room.hostId;
      expect(assertIsHost(created.value.room, stolen)).toEqual({ ok: false, error: { code: "NOT_HOST" } });

      const result = await addTrackToQueue(
        { code: created.value.room.id, token: stolen, videoInput: "dQw4w9WgXcQ", title: "pwned" },
        store,
      );
      expect(result).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });

    it("un token con formato inválido se rechaza como NOT_HOST sin tirar excepción", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      expect(assertIsHost(created.value.room, "no-es-un-token")).toEqual({ ok: false, error: { code: "NOT_HOST" } });
      expect(assertIsHost(created.value.room, "")).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });

    it("el token que devuelve joinRoom corresponde al userId de ese oyente, no al del host", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const joined = await joinRoom({ code: created.value.room.id, userName: "Frodo" }, store);
      if (!joined.ok) throw new Error("setup falló");

      expect(assertIsHost(created.value.room, joined.value.token)).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });
  });

  describe("addTrackToQueue (comando solo-host)", () => {
    it("permite al host agregar un video válido", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      const result = await addTrackToQueue(
        {
          code: created.value.room.id,
          token: created.value.hostToken,
          videoInput: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "Never Gonna Give You Up",
        },
        store,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.queue).toEqual([
        {
          id: "dQw4w9WgXcQ",
          title: "Never Gonna Give You Up",
          thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        },
      ]);
    });

    it("rechaza a un usuario que no es el host — esta es la regla que cambió respecto a la app original", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      const result = await addTrackToQueue(
        {
          code: created.value.room.id,
          token: generateToken(),
          videoInput: "dQw4w9WgXcQ",
          title: "Intento no autorizado",
        },
        store,
      );

      expect(result).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });

    it("rechaza un video inválido incluso viniendo del host", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      const result = await addTrackToQueue(
        { code: created.value.room.id, token: created.value.hostToken, videoInput: "corto", title: "x" },
        store,
      );

      expect(result).toEqual({ ok: false, error: { code: "INVALID_VIDEO_ID" } });
    });

    it("devuelve ROOM_NOT_FOUND si la sala no existe", async () => {
      const result = await addTrackToQueue(
        { code: "ZZZZZZ", token: generateToken(), videoInput: "dQw4w9WgXcQ", title: "x" },
        store,
      );
      expect(result).toEqual({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
    });
  });

  describe("removeTrackFromQueue", () => {
    async function setupRoomWithTwoTracks() {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;

      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "dQw4w9WgXcQ", title: "Uno" }, store);
      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "jNQXAC9IVRw", title: "Dos" }, store);

      return { code: room.id, hostToken };
    }

    it("permite al host quitar un track por índice", async () => {
      const { code, hostToken } = await setupRoomWithTwoTracks();

      const result = await removeTrackFromQueue({ code, token: hostToken, index: 0 }, store);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.queue).toHaveLength(1);
      expect(result.value.queue[0]?.title).toBe("Dos");
    });

    it("rechaza a quien no es host", async () => {
      const { code } = await setupRoomWithTwoTracks();
      const result = await removeTrackFromQueue({ code, token: generateToken(), index: 0 }, store);
      expect(result).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });

    it("rechaza un índice fuera de rango", async () => {
      const { code, hostToken } = await setupRoomWithTwoTracks();
      const result = await removeTrackFromQueue({ code, token: hostToken, index: 99 }, store);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_REQUEST");
    });
  });

  describe("reorderQueue", () => {
    async function setupRoomWithThreeTracks() {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;

      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "aaaaaaaaaaa", title: "A" }, store);
      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "bbbbbbbbbbb", title: "B" }, store);
      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "ccccccccccc", title: "C" }, store);

      return { code: room.id, hostToken };
    }

    it("mueve un track de una posición a otra", async () => {
      const { code, hostToken } = await setupRoomWithThreeTracks();

      const result = await reorderQueue({ code, token: hostToken, from: 0, to: 2 }, store);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.queue.map((t) => t.title)).toEqual(["B", "C", "A"]);
    });

    it("rechaza mover a la misma posición", async () => {
      const { code, hostToken } = await setupRoomWithThreeTracks();
      const result = await reorderQueue({ code, token: hostToken, from: 1, to: 1 }, store);
      expect(result.ok).toBe(false);
    });

    it("rechaza a quien no es host", async () => {
      const { code } = await setupRoomWithThreeTracks();
      const result = await reorderQueue({ code, token: generateToken(), from: 0, to: 1 }, store);
      expect(result).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });
  });

  describe("shuffleQueue", () => {
    it("conserva los mismos tracks, solo cambia (probablemente) el orden", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;

      for (const [videoInput, title] of [
        ["aaaaaaaaaaa", "A"],
        ["bbbbbbbbbbb", "B"],
        ["ccccccccccc", "C"],
        ["ddddddddddd", "D"],
      ] as const) {
        await addTrackToQueue({ code: room.id, token: hostToken, videoInput, title }, store);
      }

      const result = await shuffleQueue({ code: room.id, token: hostToken }, store);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.queue).toHaveLength(4);
      expect(new Set(result.value.queue.map((t) => t.title))).toEqual(new Set(["A", "B", "C", "D"]));
    });

    it("rechaza a quien no es host", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      const result = await shuffleQueue({ code: created.value.room.id, token: generateToken() }, store);
      expect(result).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });
  });

  describe("clearQueue", () => {
    it("vacía la cola sin tocar currentTrack ni el anchor", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;

      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "dQw4w9WgXcQ", title: "Uno" }, store);

      const result = await clearQueue({ code: room.id, token: hostToken }, store);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.queue).toEqual([]);
      expect(result.value.currentTrack).toBeNull();
      expect(result.value.anchor).toEqual(room.anchor);
    });

    it("rechaza a quien no es host", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");

      const result = await clearQueue({ code: created.value.room.id, token: generateToken() }, store);
      expect(result).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });
  });

  describe("playTrackAt", () => {
    it("mueve el track de la cola a currentTrack y resetea el anchor", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;

      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "dQw4w9WgXcQ", title: "Uno" }, store);
      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "jNQXAC9IVRw", title: "Dos" }, store);

      const result = await playTrackAt({ code: room.id, token: hostToken, index: 1 }, store);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentTrack?.title).toBe("Dos");
      expect(result.value.queue.map((t) => t.title)).toEqual(["Uno"]);
      expect(result.value.anchor).toMatchObject({ position: 0, isPlaying: true });
    });

    it("rechaza a quien no es host", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;
      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "dQw4w9WgXcQ", title: "Uno" }, store);

      const result = await playTrackAt({ code: room.id, token: generateToken(), index: 0 }, store);
      expect(result).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });
  });

  describe("setPlaybackState", () => {
    it("actualiza el anchor cuando ya hay un track sonando", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;
      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "dQw4w9WgXcQ", title: "Uno" }, store);
      await playTrackAt({ code: room.id, token: hostToken, index: 0 }, store);

      const result = await setPlaybackState(
        { code: room.id, token: hostToken, isPlaying: false, position: 42 },
        store,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.anchor).toMatchObject({ position: 42, isPlaying: false });
    });

    it("rechaza si todavía no hay nada sonando", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;

      const result = await setPlaybackState(
        { code: room.id, token: hostToken, isPlaying: true, position: 0 },
        store,
      );
      expect(result.ok).toBe(false);
    });

    it("rechaza a quien no es host", async () => {
      const created = await createRoom({ hostName: "Gandalf" }, store);
      if (!created.ok) throw new Error("setup falló");
      const { room, hostToken } = created.value;
      await addTrackToQueue({ code: room.id, token: hostToken, videoInput: "dQw4w9WgXcQ", title: "Uno" }, store);
      await playTrackAt({ code: room.id, token: hostToken, index: 0 }, store);

      const result = await setPlaybackState({ code: room.id, token: generateToken(), isPlaying: true, position: 0 }, store);
      expect(result).toEqual({ ok: false, error: { code: "NOT_HOST" } });
    });
  });
});
