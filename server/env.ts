import { fileURLToPath } from "node:url";

/**
 * Carga el `.env` de la raíz del proyecto en `process.env`.
 *
 * Por qué hace falta: en producción systemd lo inyecta con
 * `EnvironmentFile=` (ver deploy/tavernsound.service), pero `tsx` no lee
 * `.env` por su cuenta — sin esto, en local el `.env` se ignoraba en
 * silencio y, por ejemplo, las credenciales de Redis nunca se usaban
 * (caía a memoria sin avisar). Con esto local y nube leen el mismo archivo.
 *
 * Las variables que ya estén definidas en el entorno ganan sobre el
 * archivo (mismo criterio que systemd y que cualquier shell: un
 * `PORT=4000 npm run dev:server` pisa lo que diga el `.env`).
 *
 * Tiene que ser el PRIMER import de cada entrypoint, para que el resto
 * de los módulos ya encuentre `process.env` completo cuando lo lean.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (err) {
  // Sin .env no pasa nada: se usan los valores por default.
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}
