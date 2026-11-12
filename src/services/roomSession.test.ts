// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { clearRoomSession, loadRoomSession, saveRoomSession } from "./roomSession";

describe("roomSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("guarda y recupera una sesión", () => {
    saveRoomSession("abc123", { token: "t1", userId: "u1", userName: "Frodo" });
    expect(loadRoomSession("abc123")).toEqual({ token: "t1", userId: "u1", userName: "Frodo" });
  });

  it("normaliza el código a mayúsculas como clave", () => {
    saveRoomSession("abc123", { token: "t1", userId: "u1", userName: "Frodo" });
    expect(loadRoomSession("ABC123")).toEqual({ token: "t1", userId: "u1", userName: "Frodo" });
  });

  it("devuelve null si no hay nada guardado para ese código", () => {
    expect(loadRoomSession("ZZZZZZ")).toBeNull();
  });

  it("devuelve null ante JSON corrupto en vez de tirar una excepción", () => {
    sessionStorage.setItem("tavernsound:session:ABC123", "{esto no es json");
    expect(loadRoomSession("abc123")).toBeNull();
  });

  it("devuelve null si el objeto guardado no tiene la forma esperada", () => {
    sessionStorage.setItem("tavernsound:session:ABC123", JSON.stringify({ token: "t1", userId: "u1" })); // falta userName
    expect(loadRoomSession("abc123")).toBeNull();
  });

  it("clearRoomSession borra solo la sesión de ese código", () => {
    saveRoomSession("abc123", { token: "t1", userId: "u1", userName: "Frodo" });
    saveRoomSession("def456", { token: "t2", userId: "u2", userName: "Sam" });

    clearRoomSession("abc123");

    expect(loadRoomSession("abc123")).toBeNull();
    expect(loadRoomSession("def456")).toEqual({ token: "t2", userId: "u2", userName: "Sam" });
  });
});
