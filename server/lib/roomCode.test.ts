import { describe, expect, it } from "vitest";
import { generateRoomCode, isValidRoomCode } from "./roomCode";

describe("generateRoomCode", () => {
  it("genera códigos de 6 caracteres que pasan su propia validación", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it("nunca incluye caracteres ambiguos (0, O, 1, I, L)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode()).not.toMatch(/[0O1IL]/);
    }
  });
});

describe("isValidRoomCode", () => {
  it("rechaza largos incorrectos y caracteres fuera del alfabeto", () => {
    expect(isValidRoomCode("ABC12")).toBe(false); // corto
    expect(isValidRoomCode("ABCD123")).toBe(false); // largo
    expect(isValidRoomCode("ABCD1O")).toBe(false); // O ambigua
    expect(isValidRoomCode("abcd12")).toBe(false); // minúsculas
  });
});
