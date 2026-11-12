import { describe, expect, it } from "vitest";
import { generateToken, isValidToken, safeEqual, userIdFromToken } from "./auth";

describe("auth", () => {
  it("genera tokens de 64 caracteres hex, distintos cada vez", () => {
    const a = generateToken();
    const b = generateToken();
    expect(isValidToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("deriva el mismo userId para el mismo token, y uno distinto para otro token", () => {
    const token = generateToken();
    expect(userIdFromToken(token)).toBe(userIdFromToken(token));
    expect(userIdFromToken(token)).not.toBe(userIdFromToken(generateToken()));
  });

  it("el userId público NO sirve como token (es justamente lo que se exponía antes)", () => {
    const token = generateToken();
    const userId = userIdFromToken(token);
    // Tiene formato válido de token, pero hashearlo no devuelve el mismo valor:
    expect(isValidToken(userId)).toBe(true);
    expect(userIdFromToken(userId)).not.toBe(userId);
  });

  it("rechaza tokens con formato inválido", () => {
    expect(isValidToken("corto")).toBe(false);
    expect(isValidToken("g".repeat(64))).toBe(false); // no es hex
    expect(isValidToken("a".repeat(65))).toBe(false); // largo de más
    expect(isValidToken(undefined)).toBe(false);
    expect(isValidToken(12345)).toBe(false);
  });

  it("safeEqual compara correctamente, incluso con largos distintos", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
