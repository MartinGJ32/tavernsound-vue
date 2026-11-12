// Tiene que ir primero: carga el .env igual que el servidor, así el diagnóstico
// ve exactamente los mismos valores que va a ver el proceso real.
import "./env";
import { existsSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { ROOM_TTL_SECONDS, activeStoreKind, getRoomStore } from "./lib/roomStore";

/**
 * Muestra los parámetros EFECTIVOS del servidor en esta máquina (después de
 * aplicar .env, variables de entorno y defaults), para poder compararlos
 * entre local y la nube. Nunca imprime secretos: de Redis muestra solo el
 * host, jamás el token.
 *
 *   npm run diagnose                          → informe legible
 *   npm run -s diagnose -- --json > local.json → solo lo comparable, para `diff`
 *   --no-check                                → no probar la conexión a Redis
 */
const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const skipCheck = args.has("--no-check");

const root = fileURLToPath(new URL("..", import.meta.url));
const config = loadConfig();
const store = activeStoreKind();

const redisHost = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "(URL inválida)";
  }
})();

async function checkStore(): Promise<{ ok: boolean; ms?: number; detail?: string }> {
  const startedAt = performance.now();
  try {
    await Promise.race([
      getRoomStore().get("DIAGNOSE"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("sin respuesta en 5 s")), 5000)),
    ]);
    return { ok: true, ms: Math.round(performance.now() - startedAt) };
  } catch (err) {
    let detail = err instanceof Error ? err.message : String(err);
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (token) detail = detail.replaceAll(token, "***"); // por las dudas: jamás exponer el token
    return { ok: false, detail: detail.slice(0, 160) };
  }
}

async function probeRunningServer(port: number): Promise<string> {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { status?: string; mode?: string; store?: string; uptimeSeconds?: number };
    if (body.status !== "ok") throw new Error("no es TavernSound");
    return `corriendo (modo ${body.mode}, almacenamiento ${body.store}, ${body.uptimeSeconds}s activo)`;
  } catch {
    return "no hay un servidor TavernSound respondiendo (o algo distinto —¿la app legacy?— usa ese puerto)";
  }
}

const check = skipCheck ? null : await checkStore();
const envFile = existsSync(`${root}.env`);
const frontendBuilt = existsSync(`${root}dist/index.html`);

if (asJson) {
  // Solo valores que DEBERÍAN coincidir (o diferir por una razón conocida)
  // entre dos entornos: nada volátil como uptime, hostname o latencias.
  const params = {
    mode: config.mode,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    port: config.port,
    trustProxy: config.trustProxy,
    envFile,
    frontendBuilt,
    store,
    redisHost,
    storeConnection: check === null ? "omitido" : check.ok ? "ok" : "error",
    roomTtlSeconds: ROOM_TTL_SECONDS,
    hostReassignmentGraceMs: config.hostReassignmentGraceMs,
    createRoomLimit: config.createRoomLimit,
    limits: config.limits,
  };
  console.log(JSON.stringify(params, null, 2));
  process.exit(check && !check.ok ? 1 : 0);
}

const row = (label: string, value: unknown) => console.log(`  ${label.padEnd(32)}${value}`);
const section = (title: string) => console.log(`\n${title}`);

console.log("TavernSound — parámetros efectivos en esta máquina");
console.log("═".repeat(52));

section("Máquina");
row("hostname", os.hostname());
row("sistema", `${process.platform} ${process.arch}`);
row("node", process.version);

section("Entorno");
row("NODE_ENV (crudo)", process.env.NODE_ENV ?? "(sin definir)");
row("modo efectivo", config.mode);
row(".env presente", envFile ? "sí" : "no");
row("frontend compilado (dist/)", frontendBuilt ? "sí" : "no");

section("Servidor");
row("puerto", config.port);
row("proxies delante (trust proxy)", config.trustProxy === false ? "ninguno" : `${config.trustProxy} (Caddy)`);
row("estado ahora", await probeRunningServer(config.port));

section("Persistencia");
row("almacenamiento", store === "upstash" ? "Redis (Upstash)" : "memoria (se pierde al reiniciar)");
if (redisHost) row("host de Redis", redisHost);
if (check === null) row("conexión", "no probada (--no-check)");
else row("conexión", check.ok ? `ok (${check.ms} ms)` : `FALLÓ — ${check.detail}`);
row("vida de una sala", `${ROOM_TTL_SECONDS / 3600} h sin actividad`);

section("Reasignación de host");
row("margen de gracia", `${config.hostReassignmentGraceMs} ms`);

section("Límites");
row("API", `${config.limits.apiRequestsPerMinute} pedidos/min por IP`);
row("crear salas", `${config.createRoomLimit} cada ${config.limits.createRoomWindowMinutes} min por IP`);
row("chat", `${config.limits.chatMaxMessages} mensajes cada ${config.limits.chatWindowMs} ms por socket`);
row("body JSON máx.", `${config.limits.maxJsonBodyBytes} bytes`);
row("mensaje de socket máx.", `${config.limits.socketMaxMessageBytes} bytes`);

const warnings: string[] = [];
if (config.isProduction && !config.redisConfigured) warnings.push("Modo producción sin Redis: las salas se pierden en cada reinicio.");
if (config.isProduction && !frontendBuilt) warnings.push("Modo producción sin frontend compilado: corré `npm run build`.");
if (!envFile) warnings.push("No hay .env: se están usando solo los defaults y lo que haya en el entorno.");
if (check && !check.ok) warnings.push("No se pudo hablar con Redis: revisá las credenciales y la conectividad.");

if (warnings.length > 0) {
  section("⚠ Atención");
  for (const warning of warnings) console.log(`  - ${warning}`);
}
console.log();
process.exit(check && !check.ok ? 1 : 0);
