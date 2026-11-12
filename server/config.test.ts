import { describe, expect, it } from "vitest";
import { hasUpstashCredentials, loadConfig } from "./config";

describe("loadConfig", () => {
  it("sin variables usa los defaults de desarrollo", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      mode: "development",
      isProduction: false,
      port: 3000,
      trustProxy: false,
      hostReassignmentGraceMs: 5000,
      createRoomLimit: 10,
      redisConfigured: false,
    });
  });

  it("NODE_ENV=production activa el modo producción y confía en un proxy", () => {
    const config = loadConfig({ NODE_ENV: "production" });
    expect(config.mode).toBe("production");
    expect(config.trustProxy).toBe(1);
  });

  it("cualquier otro NODE_ENV cuenta como desarrollo (no confía en proxies)", () => {
    expect(loadConfig({ NODE_ENV: "staging" }).trustProxy).toBe(false);
    expect(loadConfig({ NODE_ENV: "Production" }).isProduction).toBe(false); // distingue mayúsculas, como Node
  });

  it("toma los valores numéricos del entorno", () => {
    const config = loadConfig({ PORT: "8080", HOST_REASSIGNMENT_GRACE_MS: "1000", CREATE_ROOM_LIMIT: "3" });
    expect(config).toMatchObject({ port: 8080, hostReassignmentGraceMs: 1000, createRoomLimit: 3 });
  });

  it("ignora valores inválidos, vacíos o no positivos y cae al default", () => {
    for (const bad of ["abc", "", "0", "-5", "NaN"]) {
      expect(loadConfig({ PORT: bad }).port).toBe(3000);
    }
  });
});

describe("hasUpstashCredentials", () => {
  it("exige URL y token", () => {
    expect(hasUpstashCredentials({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" })).toBe(true);
    expect(hasUpstashCredentials({ UPSTASH_REDIS_REST_URL: "https://x" })).toBe(false);
    expect(hasUpstashCredentials({ UPSTASH_REDIS_REST_TOKEN: "t" })).toBe(false);
  });

  it("un valor vacío (como deja .env.example) cuenta como no configurado", () => {
    expect(hasUpstashCredentials({ UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" })).toBe(false);
  });
});
