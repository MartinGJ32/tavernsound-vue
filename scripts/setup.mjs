#!/usr/bin/env node
/**
 * Setup de un solo paso para alguien que clona el repo por primera vez.
 *
 * Por qué existe: durante la migración conviven dos apps instalables
 * (el frontend nuevo en la raíz y `legacy/`, que sigue siendo Express +
 * Socket.io). Pedirle a cada dev que recuerde instalar las dos por
 * separado, revisar su versión de Node y armar el .env a mano es fricción
 * innecesaria — este script hace las tres cosas y falla temprano con un
 * mensaje claro si algo no está listo.
 *
 * Uso: npm run setup
 */
import { execFileSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptsDir, "..");
const legacyDir = join(rootDir, "legacy");

function step(label) {
  console.log(`\n▸ ${label}`);
}

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

/**
 * Vite 8 exige Node ^20.19.0 || >=22.12.0. Node 21.x existe pero es una
 * versión "impar" sin soporte LTS y Vite no la contempla, así que no la
 * tratamos como válida aunque el número sea mayor a 20.
 */
function nodeVersionSatisfiesViteRequirement() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major === 20) return minor >= 19;
  if (major >= 22) return true;
  return false;
}

function checkNodeVersion() {
  if (!nodeVersionSatisfiesViteRequirement()) {
    console.error(
      `\n✗ Node ${process.versions.node} detectado.\n` +
        `  Este proyecto necesita Node ^20.19.0 o >=22.12.0 (lo pide Vite).\n` +
        `  Actualizá Node (por ejemplo "nvm install --lts") y volvé a correr "npm run setup".\n`,
    );
    process.exit(1);
  }
  console.log(`  Node ${process.versions.node} OK`);
}

function setupEnvFile() {
  const envPath = join(rootDir, ".env");
  const examplePath = join(rootDir, ".env.example");

  if (existsSync(envPath)) {
    console.log("  Ya existe .env, lo dejo como está.");
    return;
  }
  if (!existsSync(examplePath)) return;

  copyFileSync(examplePath, envPath);
  console.log("  Creé .env a partir de .env.example.");
  console.log("  UPSTASH_REDIS_REST_URL/TOKEN son opcionales: sin ellas, las salas se guardan en memoria.");
}

step("Verificando versión de Node");
checkNodeVersion();

step("Instalando dependencias del frontend (Vue + Vite + Tailwind)");
run("npm", ["install"], rootDir);

if (existsSync(join(legacyDir, "package.json"))) {
  step("Instalando dependencias de la app legacy (Express + Socket.io)");
  run("npm", ["install"], legacyDir);
} else {
  console.log("\n(no encontré legacy/, salteo ese paso)");
}

step("Preparando archivo .env local");
setupEnvFile();

console.log(`
✓ Listo. Para el flujo completo hacen falta DOS procesos en paralelo:

    npm run dev:server  → Express + Socket.io en http://localhost:3000
    npm run dev         → frontend en http://localhost:5173 (proxea /api y /socket.io hacia el de arriba)

Abrí http://localhost:5173 — ese es el que tenés que visitar en el navegador.

    npm run diagnose    → ver los parámetros efectivos (y LOCAL-VS-NUBE.md para compararlos con la nube)
    npm run dev:legacy  → app original en http://localhost:3000 (¡no la corras
                           al mismo tiempo que dev:server! comparten puerto)
`);
