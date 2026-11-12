# TavernSound

Escuchá música de YouTube sincronizada con amigos, en salas independientes.

## Estado de la migración

Este proyecto se está migrando de una app monolítica (HTML/CSS/JS vanilla +
Express/Socket.io de sala única, preservada en [`legacy/`](./legacy)) a
Vue 3 + TypeScript + Tailwind, con salas independientes.

> **Historial de la decisión de infraestructura, por transparencia:** la
> Fase 1 eligió "Ably + Vercel KV" asumiendo despliegue en Vercel. Se
> corrigió en dos pasos:
> 1. Vercel KV está descontinuado → se pasó a Redis vía Upstash (mismo
>    motor, se accede distinto).
> 2. El destino final de despliegue es una **VM persistente y gratuita en
>    Oracle Cloud (OCI Always Free)**, no Vercel. Eso saca de en medio la
>    única razón por la que hacía falta Ably (Vercel no sostiene procesos
>    ni WebSockets persistentes) — con una VM que corre sin parar, un
>    servidor Socket.io propio hace lo mismo gratis y con una dependencia
>    externa menos. Se reemplazó Ably por Socket.io en consecuencia.
>
> Redis se mantiene — nunca fue una limitación específica de Vercel, sino
> una forma de que el estado de las salas sobreviva a un reinicio del
> proceso, algo que sigue siendo válido en una VM.

**Fase actual: 9 y 10 — despliegue en OCI y revisión de seguridad final.**

- **Comparar local vs. nube:** [`LOCAL-VS-NUBE.md`](./LOCAL-VS-NUBE.md) explica
  cómo iniciarlo en local, cómo ver los parámetros efectivos de cada entorno
  (`npm run diagnose`, `/api/health`) y cómo compararlos con un `diff`.
- **Despliegue (Fase 9):** [`DEPLOY.md`](./DEPLOY.md) es una guía paso a paso
  para una VM Always Free de OCI: systemd para mantener el proceso vivo,
  Caddy como reverse proxy con HTTPS automático, y el detalle que más
  tropieza en OCI — hay *dos* firewalls (el Security List de la VCN y el de
  la VM), y en Ubuntu hay que insertar la regla antes del `REJECT` o no
  surte efecto. Los archivos están en [`deploy/`](./deploy).
- **Revisión de seguridad (Fase 10):** repasé el proyecto contra el
  checklist del brief original y encontré —y corregí— una falla grave en
  mi propio diseño. Ver la sección [Seguridad](#seguridad) más abajo.

Antes de esto: la Fase 8 hizo que un refresh de página retome tu sesión
(mismo rol, incluido el de host) en vez de "unirte de cero", y que el
servidor espere un margen de gracia antes de reasignar el host, para que
ese refresh no se lo haga perder.

Fases planeadas (ver el análisis completo para el detalle de cada una):

1. ✅ Scaffolding Vue + TS + Vite + Tailwind
2. ✅ Tipos y contrato de eventos realtime
3. ✅ Sistema de salas (crear/unirse por código)
4. ✅ Migración de UI a componentes (reproductor, cola, chat)
5. ✅ Reproductor real (YouTube IFrame API) y corrección de deriva
6. ✅ Realtime con Socket.io: chat en vivo + estado de reproducción sincronizado entre todos
7. ✅ Reasignación de host cuando el host actual se desconecta
8. ✅ Sesiones persistentes (sobrevivir a un refresh) + margen de gracia para la reasignación de host
9. ✅ Despliegue en OCI (systemd, Caddy con HTTPS, firewall de dos capas) — documentado, **no probado contra una VM real**
10. ✅ Revisión de seguridad final (autenticación por token, límites de frecuencia, headers)

## Stack

- **Frontend:** Vue 3 (Composition API), TypeScript, Vite, Tailwind CSS 4, Vue Router, Pinia.
- **Backend:** un solo proceso Node persistente (`server/`) — Express para la API REST, Socket.io para realtime, pensado para correr en una VM (OCI Always Free).
- **Persistencia:** Redis (Upstash, por REST) para el estado de las salas; cae a memoria si no hay credenciales.
- **Tests:** Vitest, sobre la lógica pura (sin infraestructura real) — ver más abajo.

## Desarrollo local

Primera vez (instala el frontend, el server, la app legacy, y crea tu `.env` local):

```bash
npm run setup
```

Después, **hacen falta dos procesos en paralelo**:

```bash
npm run dev:server   # Express + Socket.io en http://localhost:3000
npm run dev          # frontend en http://localhost:5173 (proxea /api y /socket.io hacia el de arriba)
```

Abrí **http://localhost:5173** en el navegador — ese es el que tiene el frontend.

```bash
npm run build          # type-check (app + node + server) + build de producción a dist/
npm run preview        # sirve el build de producción localmente (solo frontend, sin API)
npm run type-check     # solo type-check, sin build
npm run start:server   # corre el server compilado-al-vuelo, sin --watch (para producción)
npm test               # corre los tests con Vitest
npm run diagnose       # parámetros efectivos de esta máquina (ver LOCAL-VS-NUBE.md)
npm run dev:legacy     # app original en http://localhost:3000 — ¡no la corras junto con dev:server! comparten puerto por default
```

En producción (`NODE_ENV=production`), un solo proceso (`npm run
start:server`) sirve todo: la API, Socket.io, y el frontend ya compilado
desde `dist/` — hace falta correr `npm run build` antes. Esto es
justamente lo que simplifica el despliegue en OCI: una sola VM, un solo
proceso, un solo puerto.

### Verificación manual del realtime

Además de los tests automáticos, hay un script que levanta clientes de
Socket.io de verdad contra el server corriendo y chequea, de punta a punta:
la autenticación por token (incluyendo el exploit del `hostId` público como
regresión: tiene que dar 403), unirse, contador de oyentes, chat en vivo y
su límite de frecuencia (un flood de 12 mensajes tiene que cortarse),
sincronización en vivo, que un refresh del host **no** dispare una
reasignación, que una desconexión real sí la dispare pasado el margen, y
que el ex-host ya no pueda editar la cola:

```bash
npm run dev:server &          # dejalo corriendo en otra terminal si preferís
node scripts/manual-socket-test.mjs

# Con un margen de gracia corto, para no esperar los 5s por default:
HOST_REASSIGNMENT_GRACE_MS=1000 npm run dev:server &
HOST_REASSIGNMENT_GRACE_MS=1000 node scripts/manual-socket-test.mjs
```

No es parte de la suite de Vitest a propósito — es una verificación de
extremo a extremo contra el proceso real, no una prueba unitaria.

## Tests

```bash
npm test
```

84 tests: el parseo validado de `RoomEvent`, la extracción de ID de
YouTube, la generación de código de sala, el servicio de salas completo
(crear, unirse, y las siete mutaciones con su autorización "solo el
host"), el algoritmo de corrección de deriva, cómo el store aplica cada
evento realtime, la persistencia de sesión, y — de la Fase 10 — el módulo
de autenticación por token, el limitador de frecuencia, y **tests de
regresión del exploit del `hostId` público** (usar el `hostId` visible en
el estado de la sala como credencial tiene que fallar). Todo corre contra
lógica en memoria: nada necesita Redis ni una conexión real.

Lo que los tests unitarios no pueden cubrir —Socket.io real, headers HTTP,
límites de frecuencia, el margen de gracia— lo cubre el script de
verificación manual de arriba, que también incluye el exploit como
regresión contra el servidor corriendo.

## Estructura

```
server/
├── lib/
│   ├── auth.ts               # token secreto + userId público (sha256), comparación en tiempo constante
│   ├── rateLimit.ts          # limitador de ventana deslizante (chat, por socket)
│   ├── roomCode.ts          # generación + formato del código de sala
│   ├── roomStore.ts          # interfaz RoomStore + factory (Upstash o memoria)
│   ├── upstashRoomStore.ts   # implementación real sobre Redis
│   ├── memoryRoomStore.ts    # implementación en memoria (dev sin Redis / tests)
│   ├── roomService.ts        # lógica de negocio: sala, cola, reproducción, autorización de host
│   └── http.ts               # helpers de respuesta HTTP compartidos
├── routes/
│   └── rooms.ts              # todos los endpoints REST de /api/rooms/*
├── socket.ts                 # conexión, presencia, chat, y reasignación de host
└── index.ts                  # entrypoint: Express + Socket.io + helmet + límites + (en prod) estáticos del frontend
src/
├── components/    # TrackItem, Queue, AddTrackForm, MusicPlayer + sus piezas, ChatPanel, RoomHeader, ConfirmDialog, ToastHost…
├── views/         # HomeView, RoomView — componen todo lo anterior
├── layouts/       # DefaultLayout
├── composables/   # usePlayer, useSynchronization, usePlayerPreferences, useRealtime (Socket.io), useToast
├── stores/        # room.ts (Pinia) — sala, cola, reproducción, quién soy, si soy el host
├── services/      # roomApi.ts (cliente de /api/rooms/*), youtubeMetadata.ts (título vía oEmbed), roomSession.ts (sesión en sessionStorage, Fase 8)
├── types/         # Track, RoomState, RoomEvent, RoomCommand, API — con guardas en runtime
├── utils/         # validation.ts, syncAlgorithm.ts (algoritmo de sincronización, puro y testeado)
├── router/
└── App.vue
deploy/            # systemd, Caddyfile, scripts de firewall y de redeploy (ver DEPLOY.md)
legacy/            # app original, intacta, como referencia y red de seguridad
scripts/
├── setup.mjs                 # instala todo (frontend + server + legacy) y prepara el .env
└── manual-socket-test.mjs    # verificación manual de extremo a extremo del realtime
```

Cada carpeta bajo `src/` sin archivos propios todavía tiene un `README.md`
con el detalle de qué va ahí y en qué fase se completa.

## Variables de entorno

Ver [`.env.example`](./.env.example) para el detalle completo. Resumen:

| Variable | Dónde se usa | Hace falta desde |
|---|---|---|
| `NODE_ENV` | `server/config.ts` | `production` solo en la nube (lo fija systemd, no el `.env`) |
| `PORT` | `server/index.ts` | Opcional, default 3000 |
| `HOST_REASSIGNMENT_GRACE_MS` | `server/socket.ts` | Opcional, default 5000 |
| `CREATE_ROOM_LIMIT` | `server/index.ts` | Opcional, default 10 salas cada 10 min por IP |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | `server/lib/upstashRoomStore.ts` | Fase 3 (opcional: sin esto, cae a memoria) |

Ya no hay ninguna variable relacionada a Ably ni a Vercel. El `.env` se lee tanto en
local como en la nube (`server/env.ts`); una variable definida en el shell gana sobre el archivo.

## Seguridad

Revisión contra el checklist del brief original (XSS, datos sin validar,
autorización solo en el frontend, secretos, abuso de endpoints, códigos de
sala, acceso no autorizado):

### La falla que encontré (y era mía)

En las Fases 3–4 el `userId` hacía de credencial: el servidor validaba que
quien pedía un comando de host tuviera el mismo `userId` que `room.hostId`.
Pero `hostId` viaja en el estado público de la sala, que recibe *cualquier*
participante. Es decir: **cualquiera que conociera el código de una sala
podía leer el `hostId` y actuar como host.** Lo reproduje contra el
servidor real (HTTP 201 en vez de 403) antes de tocar nada.

La validación server-side existía, pero comparaba contra algo público.

### El arreglo

Se separó identidad pública de credencial secreta (`server/lib/auth.ts`):

- Cada participante recibe un **token** aleatorio de 256 bits, que vive
  solo en su navegador (`sessionStorage`) y viaja en `Authorization:
  Bearer` — nunca en la URL ni en el body.
- Su **`userId` público** es `sha256(token)`. Ver el `hostId` no permite
  recuperar el token. El servidor no guarda tokens: los hashea al vuelo y
  compara en tiempo constante.
- En Socket.io el cliente manda su token en el `join`; el servidor deriva
  la identidad. Nadie puede declararse otra persona en el handshake, y el
  `userId` de cada mensaje de chat lo pone el servidor, no el cliente.

### Resto de la revisión

| Punto del brief | Estado |
|---|---|
| XSS | Sin `v-html`/`innerHTML` en `src/` (verificado con grep); todo el contenido de usuarios pasa por la interpolación de Vue, que escapa. `thumbnailUrl` la arma el servidor a partir de un ID validado, nunca viene del cliente. |
| Datos sin validar | Tokens con formato estricto, IDs de video por regex, textos recortados, índices validados, body de máx. 10 KB, mensajes de Socket.io de máx. 10 KB. JSON malformado → 400. |
| Abuso de endpoints | 120 pedidos/min por IP en toda la API y 10 salas cada 10 min por IP; chat limitado a 5 mensajes cada 5 s por socket. Verificado en vivo, incluso el conteo *por cliente* detrás de un proxy (`trust proxy`). |
| Códigos de sala | 31⁶ ≈ 887 millones de combinaciones, y el tope por IP vuelve inviable probarlos al azar. |
| Secretos | Ninguno en el bundle del cliente (no hay variables `VITE_*`); `.env` ignorado por git. |
| Estabilidad | Un fallo de Redis dentro de un handler de socket ya no puede tumbar el proceso (una promesa rechazada sin capturar termina Node por default). |
| Headers | `helmet`: `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS (180 días, sin subdominios). |
| `npm audit` | 0 vulnerabilidades (se corrigió un aviso de `source-map-js`). |

### Lo que queda abierto, a propósito

- **La CSP está en modo "solo reportar".** No bloquea nada: avisa en la
  consola del navegador si algo de lo que carga la app (IFrame API de
  YouTube, fuentes, miniaturas) violaría la política. No pude abrir un
  navegador para ajustarla, y una CSP que bloquea mal rompe el reproductor
  sin avisar. **Abrí la app, mirá la consola, y cuando no haya
  violaciones pasá `reportOnly` a `false` en `server/index.ts`.**
- **El código de sala es el "secreto" para entrar.** Cualquiera que lo
  tenga puede unirse como oyente: así funciona compartir un enlace (el
  brief lo pedía). Lo que ya no puede hacer es actuar como host.
- **El token está en `sessionStorage`**, el mismo riesgo que cualquier
  token de sesión en el navegador frente a un XSS — por eso importa que no
  haya `v-html`.
- **Si el host se desconecta de verdad, pierde el rol** (pasa al oyente
  que quede) y no lo recupera al volver. Es el comportamiento del
  `promoteMaster()` de la app original.
- **`trust proxy` asume exactamente un proxy delante** (Caddy). Con Caddy,
  el `X-Forwarded-For` entrante de los clientes se descarta y se pone la IP
  real, así que no se puede falsear. No expongas el puerto 3000 directo a
  internet — la guía de despliegue ya solo abre 80/443.

## Identidad visual

La paleta (dorado sobre fondo oscuro, tipografías Cinzel/Crimson Text) es
la misma que la app original — se portó a tokens de Tailwind en
[`src/assets/main.css`](./src/assets/main.css) en vez de reinventarse.
