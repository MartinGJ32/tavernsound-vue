import { describe, expect, it } from "vitest";
import { createSlidingWindowLimiter } from "./rateLimit";

describe("createSlidingWindowLimiter", () => {
  it("deja pasar hasta `max` eventos dentro de la ventana y bloquea el siguiente", () => {
    let time = 0;
    const limiter = createSlidingWindowLimiter(3, 1000, () => time);

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
  });

  it("vuelve a dejar pasar cuando los eventos viejos salen de la ventana", () => {
    let time = 0;
    const limiter = createSlidingWindowLimiter(2, 1000, () => time);

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);

    time = 1001; // ambos eventos previos ya cayeron fuera de la ventana
    expect(limiter.allow()).toBe(true);
  });

  it("un evento bloqueado no cuenta contra el cupo (no 'castiga' de más)", () => {
    let time = 0;
    const limiter = createSlidingWindowLimiter(1, 1000, () => time);

    expect(limiter.allow()).toBe(true);
    time = 500;
    expect(limiter.allow()).toBe(false); // bloqueado a los 500ms
    time = 1001; // el único evento aceptado fue el de t=0, ya expiró
    expect(limiter.allow()).toBe(true);
  });
});
