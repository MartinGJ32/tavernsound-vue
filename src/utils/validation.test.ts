import { describe, expect, it } from "vitest";
import { extractYouTubeId, isValidYouTubeId, sanitizeText } from "./validation";

describe("extractYouTubeId", () => {
  const id = "dQw4w9WgXcQ";

  it("acepta un ID pelado", () => {
    expect(extractYouTubeId(id)).toBe(id);
  });

  it("extrae el ID de una URL watch?v=", () => {
    expect(extractYouTubeId(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
  });

  it("extrae el ID de una URL watch?v= con parámetros extra", () => {
    expect(extractYouTubeId(`https://www.youtube.com/watch?v=${id}&t=42s`)).toBe(id);
  });

  it("extrae el ID de una URL youtu.be", () => {
    expect(extractYouTubeId(`https://youtu.be/${id}`)).toBe(id);
  });

  it("extrae el ID de una URL /shorts/", () => {
    expect(extractYouTubeId(`https://www.youtube.com/shorts/${id}`)).toBe(id);
  });

  it("extrae el ID de una URL /embed/", () => {
    expect(extractYouTubeId(`https://www.youtube.com/embed/${id}`)).toBe(id);
  });

  it("recorta espacios alrededor del input", () => {
    expect(extractYouTubeId(`  ${id}  `)).toBe(id);
  });

  it("devuelve null para un input que no matchea ningún formato", () => {
    expect(extractYouTubeId("no es un video")).toBeNull();
    expect(extractYouTubeId("https://vimeo.com/12345")).toBeNull();
  });
});

describe("isValidYouTubeId", () => {
  it("exige exactamente 11 caracteres válidos", () => {
    expect(isValidYouTubeId("dQw4w9WgXcQ")).toBe(true);
    expect(isValidYouTubeId("corto")).toBe(false);
    expect(isValidYouTubeId("demasiado-largo-123")).toBe(false);
  });
});

describe("sanitizeText", () => {
  it("recorta espacios y trunca al largo máximo", () => {
    expect(sanitizeText("  hola  ", 10)).toBe("hola");
    expect(sanitizeText("un texto muy largo", 5)).toBe("un te");
  });
});
