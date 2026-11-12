import { describe, expect, it } from "vitest";
import { parseRoomEvent } from "./events";

describe("parseRoomEvent", () => {
  it("acepta un evento PLAY válido", () => {
    const data = { type: "PLAY", anchor: { position: 12.5, isPlaying: true, serverTimestamp: 1000 } };
    expect(parseRoomEvent(data)).toEqual(data);
  });

  it("acepta TRACK_CHANGE con track y anchor válidos", () => {
    const data = {
      type: "TRACK_CHANGE",
      track: { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
      anchor: { position: 0, isPlaying: true, serverTimestamp: 2000 },
    };
    expect(parseRoomEvent(data)).toEqual(data);
  });

  it("acepta QUEUE_SYNC con una cola vacía", () => {
    expect(parseRoomEvent({ type: "QUEUE_SYNC", queue: [] })).toEqual({ type: "QUEUE_SYNC", queue: [] });
  });

  it("rechaza un tipo desconocido", () => {
    expect(parseRoomEvent({ type: "DELETE_EVERYTHING" })).toBeNull();
  });

  it("rechaza PLAY sin anchor", () => {
    expect(parseRoomEvent({ type: "PLAY" })).toBeNull();
  });

  it("rechaza un anchor con campos de tipo incorrecto", () => {
    const data = { type: "SEEK", anchor: { position: "doce", isPlaying: true, serverTimestamp: 1000 } };
    expect(parseRoomEvent(data)).toBeNull();
  });

  it("rechaza QUEUE_SYNC si algún track de la cola es inválido", () => {
    const data = { type: "QUEUE_SYNC", queue: [{ id: "abc" }] };
    expect(parseRoomEvent(data)).toBeNull();
  });

  it("rechaza valores que no son objetos", () => {
    expect(parseRoomEvent(null)).toBeNull();
    expect(parseRoomEvent("PLAY")).toBeNull();
    expect(parseRoomEvent(42)).toBeNull();
  });

  it("rechaza CHAT_MESSAGE con un mensaje incompleto", () => {
    const data = { type: "CHAT_MESSAGE", message: { id: "1", text: "hola" } };
    expect(parseRoomEvent(data)).toBeNull();
  });
});
