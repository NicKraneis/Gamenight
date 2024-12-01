const socket = io();
let isGamemaster = false;
let currentRoomCode = null;
let playerName = "";
let timerInterval = null;

function showGameInterface(roomCode, asGamemaster) {
  currentRoomCode = roomCode;
  document.getElementById("current-room").textContent = roomCode;
  document.getElementById("start-section").style.display = "none";
  document.getElementById("game-section").style.display = "grid";

  // Setze die globale Variable
  isGamemaster = asGamemaster;

  // Zeige/verstecke die richtigen Bereiche
  document.getElementById("gamemaster-section").style.display = isGamemaster
    ? "grid"
    : "none";
  document.getElementById("player-section").style.display = isGamemaster
    ? "none"
    : "grid";
  document.getElementById("player-note-section").style.display = isGamemaster
    ? "none"
    : "block";
  document.getElementById("showmaster-notes").style.display = isGamemaster
    ? "block"
    : "none";
}

// Spieler Notiz Update
function updatePlayerNote(text) {
  if (!isGamemaster) {
    socket.emit("update-note", {
      roomCode: currentRoomCode,
      text: text,
    });
  }
}

// Gamemaster Notiz Update
function updateGamemasterNote(text) {
  if (isGamemaster) {
    console.log("Sending gamemaster note:", text); // Debug
    socket.emit("update-gamemaster-note", {
      roomCode: currentRoomCode,
      text: text,
    });
  }
}

// Punkte Update
function updatePoints(playerId, points) {
  if (isGamemaster) {
    socket.emit("update-points", {
      roomCode: currentRoomCode,
      playerId,
      points,
    });
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  const gamemasterNote = document.getElementById("gamemaster-note");
  if (gamemasterNote) {
    gamemasterNote.addEventListener("input", (e) => {
      updateGamemasterNote(e.target.value);
    });
  }

  // Raum erstellen
  document.getElementById("create-room").addEventListener("click", () => {
    playerName = document.getElementById("player-name").value || "Showmaster";
    socket.emit("create-room", { playerName });
    isGamemaster = true;
  });

  // Raum beitreten
  document.getElementById("join-room").addEventListener("click", () => {
    playerName = document.getElementById("player-name").value || "Player";
    const roomCode = document.getElementById("room-code").value.toUpperCase();
    socket.emit("join-room", { roomCode, playerName });
    isGamemaster = false;
  });

  // Buzzer
  document.getElementById("buzzer").addEventListener("click", () => {
    socket.emit("press-buzzer", {
      roomCode: currentRoomCode,
      playerName: playerName,
    });
  });

  // Buzzer-Kontrollen
  document.getElementById("release-buzzers").addEventListener("click", () => {
    socket.emit("release-buzzers", { roomCode: currentRoomCode });
  });

  document.getElementById("lock-buzzers").addEventListener("click", () => {
    socket.emit("lock-buzzers", { roomCode: currentRoomCode });
  });

  const playerNote = document.getElementById("player-note");
  if (playerNote) {
    playerNote.addEventListener("input", (e) => {
      if (!isGamemaster) {
        socket.emit("update-note", {
          roomCode: currentRoomCode,
          text: e.target.value,
        });
        console.log("Sending player note:", e.target.value); // Debug
      }
    });
  }

  // Timer Controls für Gamemaster
  function setupTimerControls() {
    const timerControls = document.getElementById("timer-controls");
    if (isGamemaster && timerControls) {
      timerControls.innerHTML = `
                <button class="timer-btn" data-duration="10">10s</button>
                <button class="timer-btn" data-duration="30">30s</button>
                <button class="timer-btn" data-duration="60">60s</button>
                <button class="timer-reset">Reset</button>
            `;

      timerControls.querySelectorAll(".timer-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const duration = parseInt(btn.dataset.duration);
          socket.emit("start-timer", {
            roomCode: currentRoomCode,
            duration: duration,
          });
        });
      });

      const resetBtn = timerControls.querySelector(".timer-reset");
      resetBtn.addEventListener("click", () => {
        socket.emit("reset-timer", { roomCode: currentRoomCode });
      });
    }
  }

  // Timer Setup bei Interface-Anzeige
  const originalShowGameInterface = showGameInterface;
  showGameInterface = function (roomCode, asGamemaster) {
    originalShowGameInterface(roomCode, asGamemaster);
    setupTimerControls();
  };

  document.addEventListener("keydown", (event) => {
    // Prüfen ob der Fokus auf einem Textfeld liegt
    if (
      event.code === "Space" &&
      !isGamemaster &&
      !event.target.matches("input, textarea")
    ) {
      // Verhindert Auslösung in Textfeldern
      const buzzer = document.getElementById("buzzer");
      if (!buzzer.disabled) {
        socket.emit("press-buzzer", {
          roomCode: currentRoomCode,
          playerName: playerName,
        });
      }
      event.preventDefault();
    }
  });
});

// Socket Events
socket.on("room-created", (data) => {
  showGameInterface(data.roomCode, true);
});

// In main.js - Leaderboard Erstellung ändern
socket.on("player-list-update", (players) => {
  if (!currentRoomCode) {
    showGameInterface(
      document.getElementById("room-code").value.toUpperCase(),
      false
    );
  }

  const leaderboard = document.getElementById("leaderboard");
  leaderboard.innerHTML = "<h3>Leaderboard</h3>";

  // Hier war möglicherweise der Fehler - wir filtern falsch
  const sortedPlayers = Object.values(players)
    .filter((player) => !player.isHost) // Statt isGamemaster prüfen wir auf isHost
    .sort((a, b) => b.points - a.points);

  sortedPlayers.forEach((player, index) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = `leaderboard-item ${
      index < 3 ? "rank-" + (index + 1) : ""
    }`;

    playerDiv.innerHTML = `
            <div class="rank">#${index + 1}</div>
            <div class="player-name">${player.name}</div>
            <div class="player-points">${player.points} Punkte</div>
            ${
              isGamemaster
                ? `
                <div class="point-controls">
                    <button class="plus-button" data-player="${player.id}">+100</button>
                    <button class="plus-button" data-player="${player.id}">+50</button>
                    <button class="minus-button" data-player="${player.id}">-50</button>
                    <button class="minus-button" data-player="${player.id}">-100</button>
                </div>
            `
                : ""
            }
        `;

    if (isGamemaster) {
      const plusBtns = playerDiv.querySelectorAll(".plus-button");
      const minusBtns = playerDiv.querySelectorAll(".minus-button");

      plusBtns[0].addEventListener("click", () => updatePoints(player.id, 100));
      plusBtns[1].addEventListener("click", () => updatePoints(player.id, 50));
      minusBtns[0].addEventListener("click", () =>
        updatePoints(player.id, -50)
      );
      minusBtns[1].addEventListener("click", () =>
        updatePoints(player.id, -100)
      );
    }

    leaderboard.appendChild(playerDiv);
  });

  if (sortedPlayers.length === 0) {
    const noPlayersDiv = document.createElement("div");
    noPlayersDiv.textContent = "Noch keine Spieler im Raum";
    leaderboard.appendChild(noPlayersDiv);
  }
});

socket.on("buzzer-pressed", (data) => {
  // Buzzer Sound abspielen
  const buzzerSound = document.getElementById("buzzer-sound");
  buzzerSound.currentTime = 0; // Zurücksetzen falls der Sound noch läuft
  buzzerSound.play();

  if (isGamemaster) {
    const buzzerStatus = document.getElementById("current-buzzer");
    buzzerStatus.innerHTML = `
            <div class="buzzer-pressed">
                ${data.playerName} has pressed the buzzer!
                <div class="buzzer-timestamp">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
    buzzerStatus.classList.remove("buzzer-free");
  } else {
    const buzzer = document.getElementById("buzzer");
    buzzer.disabled = true;

    if (data.playerId === socket.id) {
      buzzer.classList.remove("buzzer-active");
      buzzer.classList.add("buzzer-winner");
    } else {
      buzzer.classList.remove("buzzer-active");
      buzzer.classList.add("buzzer-disabled");
    }
  }
});

socket.on("buzzers-released", () => {
  if (isGamemaster) {
    const buzzerStatus = document.getElementById("current-buzzer");
    buzzerStatus.innerHTML = "<div>Buzzer sind freigegeben</div>";
    buzzerStatus.classList.add("buzzer-free");
  } else {
    const buzzer = document.getElementById("buzzer");
    buzzer.disabled = false;
    buzzer.classList.remove("buzzer-winner", "buzzer-disabled");
    buzzer.classList.add("buzzer-active");
  }
});

socket.on("buzzers-locked", () => {
  if (isGamemaster) {
    const buzzerStatus = document.getElementById("current-buzzer");
    buzzerStatus.innerHTML = "<div>Buzzer locked</div>";
    buzzerStatus.classList.add("buzzer-free");
  } else {
    const buzzer = document.getElementById("buzzer");
    buzzer.disabled = true;
    buzzer.classList.remove("buzzer-active", "buzzer-winner");
    buzzer.classList.add("buzzer-disabled");
  }
});

// In main.js, bei den anderen Socket Events
socket.on("notes-update", (notes) => {
  console.log("Received notes update:", notes); // Debug
  if (isGamemaster) {
    const notesContainer = document.getElementById("all-player-notes");
    if (!notesContainer) {
      console.error("Notes container not found");
      return;
    }

    notesContainer.innerHTML = "";

    // Sortiere Notizen nach Spielernamen
    const sortedNotes = Object.entries(notes).sort((a, b) =>
      a[1].playerName.localeCompare(b[1].playerName)
    );

    sortedNotes.forEach(([playerId, data]) => {
      const noteDiv = document.createElement("div");
      noteDiv.className = "player-note-container";
      noteDiv.innerHTML = `
                <div class="player-note-header">${data.playerName}</div>
                <textarea class="note-field" readonly>${
                  data.text || ""
                }</textarea>
            `;
      notesContainer.appendChild(noteDiv);
    });
  }
});

socket.on("gamemaster-note-update", (note) => {
  if (!isGamemaster) {
    const messageDisplay = document.getElementById("gamemaster-message");
    messageDisplay.textContent = note.text;
  }
});

// Timer Socket Events außerhalb von DOMContentLoaded
socket.on("timer-started", (data) => {
  let seconds = data.duration;
  updateTimerDisplay(seconds);

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    seconds--;
    updateTimerDisplay(Math.max(0, seconds));

    if (seconds <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
});

socket.on("timer-reset", () => {
  clearInterval(timerInterval);
  updateTimerDisplay(0);
});

function updateTimerDisplay(seconds) {
  const masterDisplay = document.getElementById("timer-display-master");
  const playerDisplay = document.getElementById("timer-display-player");

  // Countdown Sound bei 3 Sekunden
  if (seconds === 3) {
    const countdownSound = document.getElementById("countdown-sound");
    countdownSound.currentTime = 0;
    countdownSound.play();
  }

  // Timer class basierend auf verbleibender Zeit
  const timerClass =
    seconds <= 5 && seconds > 0 ? "timer-time ending" : "timer-time";
  const timerHTML = `<div class="${timerClass}">${seconds}s</div>`;

  if (isGamemaster && masterDisplay) {
    masterDisplay.innerHTML = timerHTML;
  }
  if (!isGamemaster && playerDisplay) {
    playerDisplay.innerHTML = timerHTML;
  }

  if (seconds === 0) {
    const endMessage = '<div class="timer-time">Time\'s up!</div>';
    if (masterDisplay) masterDisplay.innerHTML = endMessage;
    if (playerDisplay) playerDisplay.innerHTML = endMessage;
  }
}

socket.on("room-error", (error) => {
  alert(error);
});
