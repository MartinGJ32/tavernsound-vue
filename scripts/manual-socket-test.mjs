#!/usr/bin/env node
// Verificación manual de extremo a extremo contra el server corriendo (no
// forma parte de la suite de Vitest). Cubre: autenticación por token
// (incluyendo el exploit del hostId público como regresión), unirse,
// contador de oyentes, chat en vivo y su límite de frecuencia, sync en
// vivo, margen de gracia ante un refresh, y reasignación de host.
import { io } from "socket.io-client";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function api(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

function connectClient(label) {
  const socket = io(BASE, { transports: ["websocket"] });
  const events = [];
  socket.on("room-event", (e) => events.push(e));
  socket.on("listenerCount", (n) => events.push({ type: "__listenerCount", n }));
  socket.on("chatRateLimited", () => events.push({ type: "__chatRateLimited" }));
  return { socket, events, label };
}

function waitFor(client, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const found = client.events.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - start > timeoutMs) return reject(new Error(`[${client.label}] timeout esperando evento`));
      setTimeout(check, 50);
    };
    check();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const graceMs = Number(process.env.HOST_REASSIGNMENT_GRACE_MS) || 5000;

  console.log("0. Headers: el Referrer-Policy no debe suprimir el Referer (si no, YouTube da Error 153)...");
  const headersRes = await fetch(`${BASE}/api/health`);
  const referrerPolicy = headersRes.headers.get("referrer-policy");
  assert(referrerPolicy === "strict-origin-when-cross-origin", `Referrer-Policy inesperado: ${referrerPolicy}`);
  console.log(`   ✓ Referrer-Policy: ${referrerPolicy}`);

  console.log("1. Creando sala y un oyente...");
  const created = (await api("POST", "/api/rooms", { body: { userName: "Host" } })).json;
  const code = created.room.id;
  const hostToken = created.token;
  const hostId = created.userId;
  assert(created.room.hostId === hostId, "el hostId público debería ser el userId del creador");
  assert(hostToken !== hostId, "el token secreto no puede ser igual al userId público");
  const joined = (await api("POST", `/api/rooms/${code}/join`, { body: { userName: "Oyente" } })).json;
  const guestToken = joined.token;
  const guestId = joined.userId;
  console.log(`   sala=${code}`);

  console.log("2. SEGURIDAD: el exploit original (usar el hostId público como credencial) debe fallar...");
  const publicState = (await api("GET", `/api/rooms/${code}`)).json;
  const stolen = await api("POST", `/api/rooms/${code}/queue`, {
    token: publicState.hostId,
    body: { videoInput: "dQw4w9WgXcQ", title: "pwned" },
  });
  assert(stolen.status === 403, `el exploit del hostId debería dar 403, dio ${stolen.status}`);
  const asGuest = await api("POST", `/api/rooms/${code}/queue`, {
    token: guestToken,
    body: { videoInput: "dQw4w9WgXcQ", title: "oyente" },
  });
  assert(asGuest.status === 403, `un oyente con su token no debería poder editar la cola, dio ${asGuest.status}`);
  const noAuth = await api("POST", `/api/rooms/${code}/queue`, { body: { videoInput: "dQw4w9WgXcQ", title: "x" } });
  assert(noAuth.status === 403, `sin Authorization debería dar 403, dio ${noAuth.status}`);
  console.log("   ✓ hostId público → 403, token de oyente → 403, sin token → 403");

  console.log("3. Conectando dos sockets (con token, no con userId)...");
  const hostClient = connectClient("host");
  const guestClient = connectClient("guest");
  hostClient.socket.emit("join", { code, token: hostToken, userName: "Host" });
  guestClient.socket.emit("join", { code, token: guestToken, userName: "Oyente" });
  const count = await waitFor(guestClient, (e) => e.type === "__listenerCount" && e.n === 2);
  console.log(`   ✓ listenerCount llegó a ${count.n}`);

  console.log("4. Chat: el servidor pone el userId, no el cliente...");
  guestClient.socket.emit("chatMessage", "hola desde el test");
  const chatEvent = await waitFor(hostClient, (e) => e.type === "CHAT_MESSAGE" && e.message.text === "hola desde el test");
  assert(chatEvent.message.userId === guestId, "el userId del chat debe ser el derivado del token del guest");
  console.log(`   ✓ host recibió "${chatEvent.message.text}" de "${chatEvent.message.userName}"`);

  console.log("5. Chat: un flood de 12 mensajes seguidos debe cortarse en el límite (5 por 5s)...");
  const before = hostClient.events.filter((e) => e.type === "CHAT_MESSAGE").length;
  for (let i = 0; i < 12; i++) guestClient.socket.emit("chatMessage", `spam ${i}`);
  await sleep(600);
  const delivered = hostClient.events.filter((e) => e.type === "CHAT_MESSAGE").length - before;
  assert(delivered <= 4, `se entregaron ${delivered} mensajes del flood (el cupo restante era 4)`);
  assert(guestClient.events.some((e) => e.type === "__chatRateLimited"), "el guest debería recibir chatRateLimited");
  console.log(`   ✓ de 12 mensajes llegaron ${delivered}; el resto fue rechazado`);

  console.log("6. Mutación REST del host (con su token) llega en vivo a los dos...");
  const add = await api("POST", `/api/rooms/${code}/queue`, {
    token: hostToken,
    body: { videoInput: "dQw4w9WgXcQ", title: "Live Sync Test" },
  });
  assert(add.status === 201, `el host con token debería poder agregar (201), dio ${add.status}`);
  const queueEvent = await waitFor(guestClient, (e) => e.type === "QUEUE_SYNC");
  console.log(`   ✓ guest recibió QUEUE_SYNC con ${queueEvent.queue.length} track(s)`);

  console.log(`7. Refresh del host: reconecta con el MISMO token dentro de los ${graceMs}ms de gracia...`);
  hostClient.socket.disconnect();
  await sleep(Math.min(300, graceMs / 2));
  const hostClient2 = connectClient("host-refrescado");
  hostClient2.socket.emit("join", { code, token: hostToken, userName: "Host" });
  await sleep(graceMs + 500);
  assert(!hostClient2.events.some((e) => e.type === "HOST_CHANGED"), "se reasignó el host pese a volver a tiempo");
  assert((await api("GET", `/api/rooms/${code}`)).json.hostId === hostId, "el host cambió tras un refresh a tiempo");
  console.log("   ✓ sigue siendo host");

  console.log("8. Desconexión real del host: pasado el margen, el guest queda promovido...");
  hostClient2.socket.disconnect();
  const hostChanged = await waitFor(guestClient, (e) => e.type === "HOST_CHANGED", graceMs + 2000);
  assert(hostChanged.hostId === guestId, "se promovió al userId equivocado");
  const promoted = await api("PATCH", `/api/rooms/${code}/playback`, {
    token: guestToken,
    body: { isPlaying: false, position: 0 },
  });
  // Todavía no hay track sonando, así que 400 (nada que pausar) y no 403 prueba que ya es host.
  assert(promoted.status !== 403, "el guest promovido debería pasar la autorización de host");
  const oldHost = await api("POST", `/api/rooms/${code}/queue`, {
    token: hostToken,
    body: { videoInput: "dQw4w9WgXcQ", title: "ex-host" },
  });
  assert(oldHost.status === 403, "el ex-host ya no debería poder editar la cola");
  console.log("   ✓ nuevo host autorizado, ex-host ya no");

  console.log("9. Un token inventado en el socket no da identidad de host...");
  const fake = connectClient("impostor");
  fake.socket.emit("join", { code, token: hostId /* el hostId público, formato válido */, userName: "Impostor" });
  await sleep(300);
  const stillGuest = await api("POST", `/api/rooms/${code}/queue`, {
    token: hostId,
    body: { videoInput: "dQw4w9WgXcQ", title: "x" },
  });
  assert(stillGuest.status === 403, "usar un id público como token jamás debe autorizar");
  fake.socket.disconnect();
  console.log("   ✓ rechazado");

  guestClient.socket.disconnect();
  console.log("\n✅ TODO OK — autenticación por token, chat con límite, sync en vivo, margen de gracia y reasignación de host.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ FALLÓ:", err.message);
  process.exit(1);
});
