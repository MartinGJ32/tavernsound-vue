/**
 * Parámetros efectivos del servidor, en un solo lugar.
 *
 * Los leen `index.ts`, `socket.ts` y la herramienta de diagnóstico
 * (`npm run diagnose`), así lo que muestra el diagnóstico es exactamente
 * lo que usa el servidor — no una copia que pueda desfasarse.
 *
 * Es una función pura sobre un objeto `env` (por default `process.env`)
 * para poder probarla sin tocar el entorno real.
 */
type Env = Record<string, string | undefined>;

export interface ServerConfig {
  /** "production" solo si NODE_ENV vale exactamente "production"; cualquier otra cosa es desarrollo. */
  mode: "production" | "development";
  isProduction: boolean;
  port: number;
  /** Cuántos proxies hay delante del servidor (Caddy en la nube = 1). `false` = ninguno. Ver server/index.ts. */
  trustProxy: number | false;
  hostReassignmentGraceMs: number;
  createRoomLimit: number;
  redisConfigured: boolean;
  /** Límites fijos (no se cambian por variable de entorno). */
  limits: {
    apiRequestsPerMinute: number;
    createRoomWindowMinutes: number;
    chatMaxMessages: number;
    chatWindowMs: number;
    maxJsonBodyBytes: number;
    socketMaxMessageBytes: number;
  };
}

/** Entero positivo, o el valor por default si falta, está vacío o no es un número válido. */
function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** ¿Hay credenciales de Upstash completas? Una URL sin token (o al revés) no alcanza. */
export function hasUpstashCredentials(env: Env = process.env): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL) && Boolean(env.UPSTASH_REDIS_REST_TOKEN);
}

export function loadConfig(env: Env = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === "production";

  return {
    mode: isProduction ? "production" : "development",
    isProduction,
    port: positiveInt(env.PORT, 3000),
    trustProxy: isProduction ? 1 : false,
    hostReassignmentGraceMs: positiveInt(env.HOST_REASSIGNMENT_GRACE_MS, 5000),
    createRoomLimit: positiveInt(env.CREATE_ROOM_LIMIT, 10),
    redisConfigured: hasUpstashCredentials(env),
    limits: {
      apiRequestsPerMinute: 120,
      createRoomWindowMinutes: 10,
      chatMaxMessages: 5,
      chatWindowMs: 5000,
      maxJsonBodyBytes: 10 * 1024,
      socketMaxMessageBytes: 10_000,
    },
  };
}
