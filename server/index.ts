// Tiene que ir primero: carga el .env antes de que cualquier otro módulo lea process.env.
import "./env";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { Server } from "socket.io";
import { loadConfig } from "./config";
import { activeStoreKind } from "./lib/roomStore";
import { createRoomsRouter } from "./routes/rooms";
import { createRoomBroadcaster, registerSocketHandlers } from "./socket";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const { port: PORT, isProduction, limits } = config;
const startedAt = Date.now();

const app = express();

// Detrás de Caddy (producción) la IP real del cliente llega en
// X-Forwarded-For. Sin esto, el limitador de abajo vería a *todos* los
// usuarios como 127.0.0.1 y los metería en el mismo cupo. Es "1" y no
// "true" a propósito: confiar solo en el primer salto (Caddy) evita que un
// cliente se invente IPs falsas mandando su propio X-Forwarded-For. En
// desarrollo no hay proxy delante, así que no se activa.
if (config.trustProxy !== false) {
  app.set("trust proxy", config.trustProxy);
}

app.use(
  helmet({
    // CSP en modo "solo reportar": no bloquea nada, pero la consola del
    // navegador avisa si algo de lo que carga la app (la IFrame API de
    // YouTube, las fuentes, las miniaturas) violaría la política. Hay que
    // abrir la app en un navegador y mirar la consola antes de pasarla a
    // modo que bloquea — una CSP mal ajustada rompería el reproductor.
    contentSecurityPolicy: {
      reportOnly: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "https://www.youtube.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:", "https://img.youtube.com", "https://i.ytimg.com"],
        "frame-src": ["https://www.youtube.com"],
        "connect-src": ["'self'", "https://www.youtube.com"],
        "object-src": ["'none'"],
      },
    },
    // COEP "require-corp" bloquearía el iframe y las miniaturas de YouTube.
    crossOriginEmbedderPolicy: false,
    // OJO: el default de helmet es "no-referrer", y con eso el reproductor
    // embebido de YouTube falla con "Error 153" — la IFrame API exige que
    // el Referer no se suprima. "strict-origin-when-cross-origin" es lo que
    // YouTube recomienda (y el default de los navegadores): hacia otros
    // sitios manda solo el origen, nunca la ruta completa.
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: { maxAge: 15552000, includeSubDomains: false },
  }),
);

app.use(express.json({ limit: limits.maxJsonBodyBytes }));

// En desarrollo, Vite corre en su propio puerto y proxea /api y
// /socket.io hacia acá (ver vite.config.ts) — el navegador nunca ve un
// origen distinto. CORS abierto acá es solo una red de seguridad para
// pegarle directo a este puerto con curl/Postman mientras se desarrolla;
// nunca se habilita en producción.
if (!isProduction) {
  app.use(cors());
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: isProduction ? undefined : { origin: "*" },
  // Los mensajes legítimos (join, chat de hasta 300 caracteres) pesan
  // bastante menos de 10 KB; el default de Socket.io es 1 MB por mensaje.
  maxHttpBufferSize: limits.socketMaxMessageBytes,
});

function rateLimited(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: { code: "RATE_LIMITED", message } });
  };
}

// Dos capas: un tope general para toda la API (frena, entre otras cosas,
// probar códigos de sala al azar contra GET /:code o /:code/join) y uno
// más estricto para crear salas (cada sala ocupa espacio en Redis 24hs).
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: limits.apiRequestsPerMinute,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimited("Demasiados pedidos. Esperá un momento y probá de nuevo."),
});
const createRoomLimiter = rateLimit({
  windowMs: limits.createRoomWindowMinutes * 60_000,
  limit: config.createRoomLimit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimited("Creaste muchas salas seguidas. Esperá unos minutos."),
});

// Solo información no sensible (nada de credenciales, URLs ni límites): sirve
// para confirmar desde afuera qué modo y qué almacenamiento está usando una
// instancia. No toca Redis a propósito — cualquiera puede llamarlo. Para el
// detalle completo, `npm run diagnose` en la máquina.
app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    status: "ok",
    mode: config.mode,
    store: activeStoreKind(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

app.use("/api/rooms", apiLimiter);
app.post("/api/rooms", createRoomLimiter);
app.use("/api/rooms", createRoomsRouter(createRoomBroadcaster(io)));
registerSocketHandlers(io);

if (isProduction) {
  // Un solo proceso sirve todo — el frontend ya buildeado y la API —
  // igual que el server.js original, ahora con salas de verdad.
  const distDir = path.join(__dirname, "..", "dist");
  app.use(express.static(distDir));

  // Fallback de SPA: cualquier ruta que no arranque con /api (por
  // ejemplo /room/ABC123, que no existe como archivo) sirve index.html
  // para que Vue Router la resuelva del lado del cliente. Se usa una
  // RegExp en vez de la sintaxis de comodín "*" porque Express 5 dejó de
  // aceptar un "*" suelto como path.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// Manejo de errores centralizado: si algún handler tira una excepción sin
// capturar, esto evita que el stack trace real le llegue al cliente
// (queda en el log del servidor, que es donde tiene que estar).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // JSON mal formado (o body demasiado grande) es culpa del cliente: 400,
  // no un 500 que parezca una falla del servidor.
  const type = (err as { type?: string } | null)?.type;
  if (type === "entity.parse.failed" || type === "entity.too.large") {
    res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Pedido inválido." } });
    return;
  }

  console.error("[server] error no manejado:", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado." } });
});

httpServer.listen(PORT, () => {
  console.log(
    `TavernSound escuchando en http://localhost:${PORT}${isProduction ? " (producción)" : ""} · almacenamiento: ${activeStoreKind()}`,
  );
  // Se avisa al arrancar —que es cuando se mira el log— y no recién en el
  // primer pedido: producción sin Redis anda, pero pierde todas las salas
  // en cada reinicio del servicio.
  if (isProduction && !config.redisConfigured) {
    console.warn(
      "[config] Producción SIN credenciales de Redis (UPSTASH_REDIS_REST_URL/TOKEN): usando memoria, " +
        "las salas se pierden al reiniciar el servicio.",
    );
  }
});
