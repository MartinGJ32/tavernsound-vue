const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ── PERSISTENCE ──
const DATA_FILE = path.join(__dirname, "playlist.json");

function loadPlaylist() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(raw) || [];
    }
  } catch (e) {
    console.error("Failed to load playlist:", e);
  }
  return [];
}

function savePlaylist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(playlist, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save playlist:", e);
  }
}

// ── STATE ──
let masterSocketId = null;

let state = {
  videoId: "",
  isPlaying: false,
  time: 0,
  updatedAt: Date.now(),
};

let playlist = loadPlaylist();

// Chat history (last 100 messages, cleared on restart)
let chatHistory = [];
const MAX_CHAT = 100;

// ── HELPERS ──
function getEstimatedTime() {
  if (!state.isPlaying) return state.time;
  const elapsed = (Date.now() - state.updatedAt) / 1000;
  return state.time + elapsed;
}

function promoteMaster() {
  const sockets = [...io.sockets.sockets.values()];
  if (sockets.length === 0) {
    masterSocketId = null;
    return;
  }
  const newMaster = sockets[0];
  masterSocketId = newMaster.id;
  newMaster.emit("masterAssigned");
  console.log("New master promoted:", newMaster.id);
}

function connectedCount() {
  return io.sockets.sockets.size;
}

function sanitizeString(str, maxLen = 200) {
  return String(str || "").trim().slice(0, maxLen);
}

function isValidVideoId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

// Broadcast listener count periodically
setInterval(() => {
  io.emit("listenerCount", connectedCount());
}, 5000);

// ── SOCKET ──
io.on("connection", (socket) => {
  const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  console.log(`User connected: ${socket.id} (${ip}) | Total: ${connectedCount()}`);

  // Assign master
  socket.on("requestMaster", () => {
    if (!masterSocketId) {
      masterSocketId = socket.id;
      socket.emit("masterAssigned");
    } else {
      socket.emit("masterExists");
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id} | Total: ${connectedCount()}`);
    if (socket.id === masterSocketId) {
      masterSocketId = null;
      promoteMaster();
    }
    io.emit("listenerCount", connectedCount());
  });

  // Sync new client
  socket.emit("syncState", { ...state, time: getEstimatedTime() });
  socket.emit("syncPlaylist", playlist);
  socket.emit("chatHistory", chatHistory);
  socket.emit("listenerCount", connectedCount());

  // Broadcast listener count to everyone on new join
  io.emit("listenerCount", connectedCount());

  // ── PLAYBACK CONTROLS (master only) ──
  socket.on("play", (data) => {
    if (socket.id !== masterSocketId) return;
    state.isPlaying = true;
    state.time = typeof data?.time === "number" ? data.time : 0;
    state.updatedAt = Date.now();
    socket.broadcast.emit("play", { ...state });
  });

  socket.on("pause", (data) => {
    if (socket.id !== masterSocketId) return;
    state.isPlaying = false;
    state.time = typeof data?.time === "number" ? data.time : 0;
    state.updatedAt = Date.now();
    socket.broadcast.emit("pause", { ...state });
  });

  socket.on("seek", (data) => {
    if (socket.id !== masterSocketId) return;
    state.time = typeof data?.time === "number" ? data.time : 0;
    state.updatedAt = Date.now();
    socket.broadcast.emit("seek", { ...state });
  });

  socket.on("loadVideo", (data) => {
    if (socket.id !== masterSocketId) return;
    if (!isValidVideoId(data?.videoId)) return;
    state.videoId = data.videoId;
    state.time = 0;
    state.isPlaying = true;
    state.updatedAt = Date.now();
    socket.broadcast.emit("loadVideo", { ...state });
  });

  // ── PLAYLIST ──
  socket.on("addVideo", (video) => {
    if (!isValidVideoId(video?.id)) return;
    if (playlist.length >= 100) {
      socket.emit("toast", "La cola está llena (máx. 100)");
      return;
    }
    const safe = {
      id: video.id,
      title: sanitizeString(video.title || "Video", 150),
      thumb: `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
    };
    playlist.push(safe);
    savePlaylist();
    io.emit("syncPlaylist", playlist);
  });

  socket.on("removeVideo", (index) => {
    if (typeof index !== "number" || index < 0 || index >= playlist.length) return;
    playlist.splice(index, 1);
    savePlaylist();
    io.emit("syncPlaylist", playlist);
  });

  socket.on("reorderPlaylist", (data) => {
    // data: { from: number, to: number }
    const { from, to } = data || {};
    if (
      typeof from !== "number" || typeof to !== "number" ||
      from < 0 || from >= playlist.length ||
      to < 0 || to >= playlist.length ||
      from === to
    ) return;
    const [item] = playlist.splice(from, 1);
    playlist.splice(to, 0, item);
    savePlaylist();
    io.emit("syncPlaylist", playlist);
    // Tell everyone about the index shift so currentIndex stays correct
    io.emit("trackReordered", { from, to });
  });

  socket.on("clearPlaylist", () => {
    playlist = [];
    state.videoId = "";
    state.isPlaying = false;
    state.time = 0;
    state.updatedAt = Date.now();
    savePlaylist();
    io.emit("syncPlaylist", playlist);
    io.emit("syncState", { ...state });
  });

  // ── CHAT ──
  socket.on("chatMessage", (data) => {
    if (!data?.text) return;
    const msg = {
      id: Date.now() + Math.random().toString(36).slice(2),
      user: sanitizeString(data.user || "Viajero", 30),
      text: sanitizeString(data.text, 300),
      time: Date.now(),
    };
    chatHistory.push(msg);
    if (chatHistory.length > MAX_CHAT) chatHistory.shift();
    io.emit("chatMessage", msg);
  });

  // ── NAME ──
  socket.on("setName", (name) => {
    const safe = sanitizeString(name, 30);
    socket.data.name = safe;
    // Confirm back
    socket.emit("nameSet", safe);
  });
});

server.listen(3000, () => {
  console.log("TavernSound running on http://localhost:3000");
});