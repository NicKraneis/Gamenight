const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
require("dotenv").config();

// Rate Limiter konfigurieren
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 300, // Limit pro IP
});

const app = express();
const server = http.createServer(app);

// Middleware
app.use(limiter);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], // Nur Ressourcen von eigener Domain
        scriptSrc: ["'self'", "'unsafe-inline'"], // JavaScript-Quellen
        styleSrc: ["'self'", "'unsafe-inline'"], // CSS-Quellen
        imgSrc: ["'self'", "data:", "https:"], // Bild-Quellen
        connectSrc: ["'self'", "wss:", "ws:"], // WebSocket-Verbindungen
      },
    },
  })
);
app.use(express.static("public"));

// Server Konfiguration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
});

// Room Management
const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function cleanupRooms() {
  for (const roomCode in rooms) {
    const room = rooms[roomCode];

    // Prüfe ob Host noch verbunden ist
    if (!io.sockets.adapter.rooms.get(roomCode)?.has(room.host)) {
      deleteRoom(roomCode);
      continue;
    }

    // Prüfe ob noch Spieler im Raum sind
    const connectedClients = io.sockets.adapter.rooms.get(roomCode)?.size || 0;
    if (connectedClients === 0) {
      deleteRoom(roomCode);
    }
  }
}

function deleteRoom(roomCode) {
  console.log(`Deleting room ${roomCode}`);
  io.to(roomCode).emit("room-closed");
  delete rooms[roomCode];
}

function startRoomTimer(roomCode) {
  const INACTIVE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 Stunden
  setTimeout(() => {
    if (rooms[roomCode]) {
      const connectedClients =
        io.sockets.adapter.rooms.get(roomCode)?.size || 0;
      if (connectedClients === 0) {
        deleteRoom(roomCode);
      }
    }
  }, INACTIVE_TIMEOUT);
}

// Regelmäßige Bereinigung
setInterval(cleanupRooms, 30 * 60 * 1000); // Alle 30 Minuten

// Socket.IO Event Handler
io.on("connection", (socket) => {
  console.log("Neuer Client verbunden");
  let currentRoom = null;

  socket.on("create-room", (data) => {
    try {
      if (!data?.playerName?.trim()) {
        throw new Error("Invalid player name");
      }

      const roomCode = generateRoomCode();
      rooms[roomCode] = {
        host: socket.id,
        players: {},
        buzzerActive: true,
        notes: {},
        gamemasterNote: "",
        createdAt: Date.now(),
        timer: {
          active: false,
          endTime: null,
          duration: 0,
        },
      };

      currentRoom = roomCode;
      socket.join(roomCode);
      socket.emit("room-created", { roomCode });
      startRoomTimer(roomCode);
      console.log(`Room ${roomCode} created by ${data.playerName}`);
    } catch (error) {
      socket.emit("room-error", error.message);
      console.error("Room creation error:", error);
    }
  });

  socket.on("join-room", (data) => {
    try {
      if (!data?.roomCode || !data?.playerName?.trim()) {
        throw new Error("Invalid room code or player name");
      }

      const room = rooms[data.roomCode];
      if (!room) {
        throw new Error("Room does not exist");
      }

      // Spieler-Limit Check (z.B. 8 Spieler)
      const playerCount = Object.keys(room.players).length;
      if (playerCount >= 12) {
        throw new Error("Room is full (max 12 players)");
      }

      currentRoom = data.roomCode;
      room.players[socket.id] = {
        id: socket.id,
        name: data.playerName,
        points: 0,
        isHost: false,
      };

      // Notiz initialisieren
      room.notes[socket.id] = {
        text: "",
        playerName: data.playerName,
      };

      socket.join(data.roomCode);
      // Update alle über neue Spielerliste
      io.to(data.roomCode).emit("player-list-update", room.players);
      // Sende aktuelle Gamemaster-Notiz an neuen Spieler
      socket.emit("gamemaster-note-update", { text: room.gamemasterNote });
      // Sende Spieler-Notizen an Host
      io.to(room.host).emit("notes-update", room.notes);

      console.log(`Player ${data.playerName} joined room ${data.roomCode}`);
    } catch (error) {
      socket.emit("room-error", error.message);
      console.error("Join room error:", error);
    }
  });

  socket.on("update-note", (data) => {
    try {
      const { roomCode, text } = data;
      const room = rooms[roomCode];

      if (room && room.players[socket.id]) {
        // Prüft ob der Sender ein Spieler ist
        room.notes[socket.id].text = text;
        // An den Host senden
        io.to(room.host).emit("notes-update", room.notes);
        console.log(`Note updated from player ${socket.id}`); // Debug-Log
      }
    } catch (error) {
      console.error("Note update error:", error);
    }
  });

  socket.on("update-gamemaster-note", (data) => {
    try {
      const { roomCode, text } = data;
      const room = rooms[roomCode];

      console.log("Received gamemaster note update:", { roomCode, text }); // Debug

      if (room && room.host === socket.id) {
        room.gamemasterNote = text;
        // An ALLE im Raum senden
        io.to(roomCode).emit("gamemaster-note-update", { text });
        console.log("Broadcasted note to room:", roomCode); // Debug
      }
    } catch (error) {
      console.error("Gamemaster note update error:", error);
    }
  });

  socket.on("press-buzzer", (data) => {
    try {
      const room = rooms[data.roomCode];
      if (room && room.buzzerActive && room.host !== socket.id) {
        room.buzzerActive = false;
        io.to(data.roomCode).emit("buzzer-pressed", {
          playerId: socket.id,
          playerName: room.players[socket.id].name,
        });
      }
    } catch (error) {
      console.error("Buzzer error:", error);
    }
  });

  socket.on("release-buzzers", (data) => {
    try {
      const room = rooms[data.roomCode];
      if (room && room.host === socket.id) {
        room.buzzerActive = true;
        io.to(data.roomCode).emit("buzzers-released");
      }
    } catch (error) {
      console.error("Release buzzers error:", error);
    }
  });

  socket.on("lock-buzzers", (data) => {
    try {
      const room = rooms[data.roomCode];
      if (room && room.host === socket.id) {
        room.buzzerActive = false;
        io.to(data.roomCode).emit("buzzers-locked");
      }
    } catch (error) {
      console.error("Lock buzzers error:", error);
    }
  });

  socket.on("update-points", (data) => {
    try {
      const { roomCode, playerId, points } = data;
      const room = rooms[roomCode];

      if (room && room.host === socket.id) {
        // Prüft ob der Sender der Host ist
        room.players[playerId].points += points;
        io.to(roomCode).emit("player-list-update", room.players);
        console.log(`Updated points for player ${playerId}: ${points}`); // Debug-Log
      }
    } catch (error) {
      console.error("Update points error:", error);
    }
  });

  socket.on("disconnect", () => {
    try {
      if (currentRoom && rooms[currentRoom]) {
        const room = rooms[currentRoom];

        // Wenn ein Spieler disconnected
        if (room.players[socket.id]) {
          delete room.notes[socket.id];
          delete room.players[socket.id];
          io.to(currentRoom).emit("player-list-update", room.players);
          io.to(room.host).emit("notes-update", room.notes);
        }

        // Wenn der Host disconnected
        if (room.host === socket.id) {
          deleteRoom(currentRoom);
        }

        // Prüfe ob Raum leer ist
        const connectedClients =
          io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
        if (connectedClients === 0) {
          deleteRoom(currentRoom);
        }
      }
      console.log("Client disconnected");
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  });

  socket.on("start-timer", (data) => {
    try {
      const { roomCode, duration } = data;
      const room = rooms[roomCode];

      if (room && room.host === socket.id) {
        io.to(roomCode).emit("timer-started", {
          duration: duration,
        });
      }
    } catch (error) {
      console.error("Timer error:", error);
    }
  });

  socket.on("reset-timer", (data) => {
    try {
      const { roomCode } = data;
      const room = rooms[roomCode];

      if (room && room.host === socket.id) {
        io.to(roomCode).emit("timer-reset");
      }
    } catch (error) {
      console.error("Timer reset error:", error);
    }
  });
});

// Server starten
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
});
