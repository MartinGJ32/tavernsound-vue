# Local vs. nube: cómo iniciarlo, ver sus parámetros y compararlos

Es el mismo código en los dos lados (`server/` y `src/`). Lo que cambia es
**cómo se arranca, qué variables recibe y qué hay alrededor** (proxy,
HTTPS, base de datos). Esta guía te deja iniciarlo en local, ver los
parámetros reales de cada entorno, y detectar rápido cuándo una
diferencia es normal y cuándo es un problema.

> Los comandos de la nube (SSH, systemd, Caddy) están escritos según la
> configuración de `DEPLOY.md` y no se pudieron probar contra una VM real
> desde donde se armó esto. Los de local sí se corrieron.

---

## 1. El mapa

```
LOCAL · desarrollo         Navegador ─▶ Vite :5173 ──proxy──▶ Node :3000 ─▶ memoria (o Redis)
                                         (2 procesos)

LOCAL · "tipo producción"  Navegador ─▶ Node :3000 (frontend compilado + API + Socket.io) ─▶ memoria (o Redis)
                                         (1 proceso)

NUBE (OCI)                 Navegador ─▶ Caddy :443 (HTTPS) ─▶ Node :3000 (systemd) ─▶ Redis (Upstash)
                                         (1 proceso detrás de un proxy)
```

| | Local · desarrollo | Local · tipo producción | Nube |
|---|---|---|---|
| Qué sirve el frontend | Vite (recarga en caliente) | Express, desde `dist/` | Express, desde `dist/` |
| URL | `http://localhost:5173` | `http://localhost:3000` | `https://tu-dominio.com` |
| `NODE_ENV` | sin definir | `production` | `production` (lo fija systemd) |
| Procesos que levantás | 2 | 1 | 1 (systemd lo mantiene vivo) |
| HTTPS | no | no | sí (Caddy) |
| Salas guardadas en | memoria, o Redis si lo configurás | ídem | Redis |
| Proxies delante (`trust proxy`) | ninguno | 1\* | 1 (Caddy) |
| CORS | abierto | cerrado | cerrado |
| Si el proceso se cae | no se levanta solo | no se levanta solo | systemd lo reinicia a los 5 s |

\* En "tipo producción" local confía en un proxy que no existe; es
irrelevante para probar, pero explica por qué ahí un `X-Forwarded-For`
inventado cambia la IP que ve el limitador de frecuencia.

El modo **"tipo producción" es el más parecido a la nube**: es lo que
conviene usar para comparar.

---

## 2. Iniciarlo en local

Requisito: Node `^20.19` o `>=22.12` (`node -v`).

### 2.1 Primera vez

```bash
npm run setup      # instala dependencias (frontend, servidor y legacy) y crea .env desde .env.example
```

### 2.2 Modo desarrollo (el del día a día) — 2 terminales

```bash
# Terminal 1 — servidor (Express + Socket.io)
npm run dev:server
#   → "TavernSound escuchando en http://localhost:3000 · almacenamiento: memory"

# Terminal 2 — frontend (Vite)
npm run dev
#   → abrí  http://localhost:5173   (no el 3000: ahí no hay frontend en este modo)
```

Para probar con dos usuarios, abrí el mismo enlace de sala en **otra
pestaña** (cada pestaña tiene su propia sesión) o en una ventana de
incógnito.

Cosas a saber:
- El frontend se recarga solo al guardar. El servidor también se reinicia
  solo, y **al reiniciarse se pierden las salas** (están en memoria).
- Si cambiás el `.env`, reiniciá `dev:server`: el reinicio automático no
  mira ese archivo.
- En desarrollo dejá el puerto en 3000: el proxy de Vite apunta ahí
  (`vite.config.ts`).

### 2.3 Modo "tipo producción" — 1 proceso

```bash
npm run build

# macOS / Linux / Git Bash
NODE_ENV=production npm run start:server
# PowerShell
$env:NODE_ENV="production"; npm run start:server
# cmd
set NODE_ENV=production&& npm run start:server
```

Abrí **`http://localhost:3000`**. Si no configuraste Redis vas a ver un
aviso al arrancar: es lo mismo que pasaría en la nube sin credenciales.

### 2.4 Con Redis real en local (opcional)

Completá `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en `.env` y
reiniciá. El arranque debe decir `almacenamiento: upstash`.

> ⚠ **Usá una base de Upstash distinta a la de la nube.** Las salas se
> guardan con la clave `room:CÓDIGO`: si local y nube apuntan a la misma
> base, comparten salas y los resultados de la comparación se mezclan.

> **Antes de esta guía el `.env` no se leía en local** (solo en la nube,
> donde systemd lo inyecta), así que las credenciales que pusieras ahí se
> ignoraban sin avisar. Ya está corregido: ahora los dos lados leen el
> mismo archivo, y una variable definida en el shell gana sobre el `.env`
> (`PORT=4000 npm run dev:server`).

### 2.5 Choque de puerto con la app vieja

`npm run dev:legacy` también usa el 3000. Si algo no responde como
esperás, `npm run diagnose` te dice qué hay en ese puerto.

---

## 3. Ver los parámetros

Hay tres formas, de más a menos detalle.

### 3.1 `npm run diagnose` — los parámetros **efectivos**

Muestra lo que el servidor va a usar de verdad en esa máquina: después de
aplicar el `.env`, las variables del entorno y los defaults. Sale del
mismo código que usa el servidor, así que no puede desfasarse. Nunca
imprime secretos (de Redis muestra solo el host, jamás el token).

```bash
npm run diagnose
```

```
TavernSound — parámetros efectivos en esta máquina
════════════════════════════════════════════════════

Entorno
  NODE_ENV (crudo)                production
  modo efectivo                   production
  .env presente                   sí
  frontend compilado (dist/)      sí

Servidor
  puerto                          3000
  proxies delante (trust proxy)   1 (Caddy)
  estado ahora                    corriendo (modo production, almacenamiento upstash, 812s activo)

Persistencia
  almacenamiento                  Redis (Upstash)
  host de Redis                   mi-base-1234.upstash.io
  conexión                        ok (84 ms)
  ...
⚠ Atención       ← solo aparece si hay algo que revisar
```

Opciones: `--no-check` (no probar la conexión a Redis) y `--json` (ver 4.1).
Si no puede hablar con Redis, termina con código de salida 1.

### 3.2 `GET /api/health` — desde afuera, sin entrar a la máquina

```bash
curl -s http://localhost:3000/api/health
curl -s https://tu-dominio.com/api/health
# {"status":"ok","mode":"production","store":"upstash","uptimeSeconds":812}
```

Es el dato más confiable de **lo que está corriendo ahora**: lo informa el
propio proceso. Solo expone modo, almacenamiento y tiempo activo — nada
sensible, y no toca Redis.

### 3.3 Dónde se define cada parámetro

| Parámetro | Default | En local | En la nube |
|---|---|---|---|
| `NODE_ENV` | sin definir (= desarrollo) | el shell: `NODE_ENV=production …` | `Environment=NODE_ENV=production` en la unidad de systemd — **no está en el `.env`** |
| `PORT` | 3000 | `.env` o shell | `.env` de la VM. **Caddy apunta a `localhost:3000`**: si lo cambiás, cambiá también `/etc/caddy/Caddyfile` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | vacío → memoria | `.env` (opcional) | `.env` de la VM (necesario en la práctica) |
| `HOST_REASSIGNMENT_GRACE_MS` | 5000 | `.env` o shell | `.env` de la VM |
| `CREATE_ROOM_LIMIT` | 10 por 10 min por IP | `.env` o shell | `.env` de la VM |
| `trust proxy` | — | derivado: desarrollo → ninguno | derivado: producción → 1 |
| Límites fijos (API 120/min, chat 5 cada 5 s, body 10 KB, mensaje de socket 10 KB, sala 24 h) | — | `server/config.ts` y `server/lib/roomStore.ts` | los mismos: son código, no se configuran |

### 3.4 En la nube, por SSH

```bash
ssh ubuntu@<IP-PÚBLICA>
cd tavernsound-vue

# Parámetros "como los ve el servicio":
NODE_ENV=production npm run diagnose
```

**Ojo con el `NODE_ENV=production`**: lo fija la unidad de systemd, no el
`.env`, así que un `npm run diagnose` a mano en la VM diría "desarrollo".
Poniéndolo en el comando ves lo que ve el servicio. Para confirmar qué
está corriendo *de verdad*, usá `/api/health` (3.2).

Para ver cómo está configurado el servicio y sus logs:

```bash
systemctl cat tavernsound                                 # la unidad, incluida la ruta del EnvironmentFile
sudo systemctl show tavernsound -p Environment            # variables fijadas en la unidad (NODE_ENV)
sudo journalctl -u tavernsound -n 30 --no-pager           # el aviso de "sin Redis" aparece al arrancar
grep -v TOKEN .env                                        # ver el .env SIN exponer el token (útil si compartís pantalla)
```

---

## 4. Comparar local contra nube

### 4.1 Diferencia automática de parámetros

`diagnose --json` imprime **solo lo comparable** (nada volátil como
uptime, hostname o latencias), con claves en orden fijo, para usar `diff`:

```bash
# En tu máquina (idealmente en modo "tipo producción", ver 2.3)
NODE_ENV=production npm run -s diagnose -- --json > local.json

# En la VM, traído a tu máquina por SSH
ssh ubuntu@<IP> 'cd tavernsound-vue && NODE_ENV=production npm run -s diagnose -- --json' > cloud.json

diff local.json cloud.json                 # macOS / Linux / Git Bash
git diff --no-index local.json cloud.json  # funciona en cualquier sistema con git
```

Usá los **mismos flags en los dos lados** (acá, ninguno): si en uno usás
`--no-check` y en el otro no, `storeConnection` va a diferir por pura
construcción del comando. Y usá `npm run -s` (silencioso): sin eso npm
agrega un encabezado a la salida y el JSON queda inválido.

### 4.2 Qué diferencias son normales y cuáles no

| Campo | Si difiere… |
|---|---|
| `mode` | **Normal** solo si comparás *desarrollo* local vs. nube. **Problema** si la nube dice `development`: falta `NODE_ENV=production` en la unidad de systemd. |
| `trustProxy` | `false` vs `1`: **normal** (es consecuencia de `mode`). |
| `store`, `redisHost` | `memory` vs `upstash`: **normal** si local no tiene Redis. **Problema** si la nube dice `memory`: faltan las credenciales en su `.env`. |
| `frontendBuilt` | `false` en tu local de desarrollo: **normal**. **Problema** si es `false` en la nube: falta `npm run build`. |
| `storeConnection` | **Problema** si es `error` en cualquiera de los dos. |
| `nodeMajor` | **Revisar**: distinta versión mayor de Node en cada lado. |
| `port` | **Problema** si la nube no usa el puerto que espera Caddy (3000). |
| `hostReassignmentGraceMs`, `createRoomLimit` | **Revisar**: alguien tocó un `.env`. Dos entornos con el mismo código y sin tocar deberían coincidir. |
| `limits.*`, `roomTtlSeconds` | **Problema**: son código fijo. Si difieren, la nube corre una versión distinta (falta `git pull` + `bash deploy/deploy.sh`). |
| `envFile` | **Problema** si es `false` en la nube: no hay `.env` donde lo espera el servicio. |

### 4.3 Comparación rápida desde tu máquina, sin SSH

```bash
curl -s http://localhost:3000/api/health      # local
curl -s https://tu-dominio.com/api/health     # nube  → debe decir "mode":"production","store":"upstash"
```

---

## 5. La misma prueba funcional en los dos lados

### 5.1 Automática

`scripts/manual-socket-test.mjs` conecta clientes de Socket.io reales y
verifica de punta a punta: `Referrer-Policy` (si falta, YouTube da "Error
153"), que el exploit del `hostId` público dé 403, unirse, contador de
oyentes, chat y su límite, sincronización en vivo, el margen de gracia y la
reasignación de host. Corre desde tu máquina contra cualquier URL:

```bash
# Local (con el servidor corriendo; el margen corto acelera la prueba)
HOST_REASSIGNMENT_GRACE_MS=1000 npm run dev:server        # en otra terminal
HOST_REASSIGNMENT_GRACE_MS=1000 node scripts/manual-socket-test.mjs

# Nube (deja el margen en su valor por defecto en los dos lados)
TEST_BASE_URL=https://tu-dominio.com node scripts/manual-socket-test.mjs
```

Dura unos 15 segundos contra la nube y crea una sala (cuenta para el
límite de 10 cada 10 minutos). Si pasa en los dos, el comportamiento del
servidor es el mismo. Si usaste `HOST_REASSIGNMENT_GRACE_MS` en uno de los
lados, el script tiene que tener el **mismo** valor que ese servidor.

### 5.2 En el navegador (lo que el script no puede ver)

Repetí esto en los dos y anotá las diferencias:

1. Crear una sala → aparece el código y la insignia de anfitrión.
2. Abrir el enlace en otra pestaña/incógnito → unirse con otro nombre.
3. Agregar un video a la cola (solo el anfitrión) → aparece en vivo en la otra pestaña.
4. Reproducirlo → **el video carga sin "Error 153"** y la otra pestaña lo sigue.
5. Pausar y buscar en la barra → la otra pestaña acompaña.
6. Chat entre las dos pestañas.
7. **Refrescar la pestaña del anfitrión** → sigue siendo anfitrión, sin pedirte el nombre.
8. Abrir la consola del navegador (F12) → anotar si aparece algún aviso de `Content-Security-Policy`. Son solo avisos (la política está en modo "solo reportar"), pero cuando no haya ninguno se puede activar de verdad — ver README, sección Seguridad.

Esta parte no se pudo verificar desde donde se armó el proyecto (nunca hubo
un navegador): es justamente donde más puede aparecer algo distinto.

---

## 6. "En local anda y en la nube no"

| Síntoma | Causa probable | Cómo confirmarlo |
|---|---|---|
| Las salas desaparecen al reiniciar el servicio | La nube usa memoria | `/api/health` → `"store":"memory"`; completar las credenciales de Redis en el `.env` de la VM y `sudo systemctl restart tavernsound` |
| No carga nada desde afuera | Firewall: hay **dos** capas (Security List de OCI + iptables de la VM) | `curl localhost:3000` funciona en la VM pero no desde afuera → ver `DEPLOY.md`, paso 2 |
| Carga la página pero cola/chat no llegan en vivo | WebSocket cortado en el camino | `curl -sI https://tu-dominio.com/socket.io/` debe dar **400** (es lo esperado); un 502 o un cuelgue indica el problema |
| "Demasiados pedidos" (429) casi enseguida y para todos | Servicio sin `NODE_ENV=production`: el limitador ve a todos los usuarios como la misma IP | `/api/health` → `"mode"` tiene que ser `production` |
| El reproductor muestra "Error 153" | `Referrer-Policy` suprime el referer | `curl -sI https://tu-dominio.com/ \| grep -i referrer-policy` → debe ser `strict-origin-when-cross-origin` |
| "Copiar enlace" no copia | El portapapeles exige HTTPS (o `localhost`) | Pasa si entrás por `http://<IP>` en la nube; con dominio y HTTPS anda |
| Caddy devuelve 502 | El proceso Node está caído | `sudo systemctl status tavernsound` y `sudo journalctl -u tavernsound -n 50` |
| Cambié el `.env` y no pasa nada | No se recarga solo | Local: reiniciar `dev:server`. Nube: `sudo systemctl restart tavernsound` |
| Local y nube "se ven las salas" entre sí | Misma base de Upstash | Usar una base distinta por entorno (2.4) |
