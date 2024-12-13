const socket = io();
let isGamemaster = false;
let currentRoomCode = null;
let playerName = "";
let timerInterval = null;
let currentAvatarId = 1;
let soundEnabled = true;

function showGameInterface(roomCode, asGamemaster) {
  currentRoomCode = roomCode;
  const roomCodeElement = document.getElementById("current-room");
  roomCodeElement.textContent = roomCode;

  roomCodeElement.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      // Visuelle Bestätigung
      roomCodeElement.textContent = "Copied!";
      setTimeout(() => {
        roomCodeElement.textContent = roomCode;
      }, 1000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  });

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

  const generatorControls = document.getElementById('random-generator-controls');
  if (generatorControls) {
      generatorControls.style.display = isGamemaster ? 'grid' : 'none';
  }
}

// Spieler Notiz Update
function updatePlayerNote(text) {
  if (!isGamemaster) {
    socket.emit("update-note", {
      roomCode: currentRoomCode,
      text: text,
      playerName: playerName // Sende den Namen mit
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
  // Sound Toggle
  const soundToggle = document.getElementById("toggle-sound");
  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;

      // Update Button
      const icon = soundToggle.querySelector(".sound-icon");
      const srText = soundToggle.querySelector(".visually-hidden");

      icon.textContent = soundEnabled ? "🔊" : "🔈";
      srText.textContent = soundEnabled ? "Sound is on" : "Sound is off";
      soundToggle.setAttribute("aria-checked", soundEnabled);
    });
  }

  const gamemasterNote = document.getElementById("gamemaster-note");
  if (gamemasterNote) {
    gamemasterNote.addEventListener("input", (e) => {
      updateGamemasterNote(e.target.value);
    });
  }

  // Raum erstellen
  document.getElementById("create-room").addEventListener("click", () => {
    playerName = document.getElementById("player-name").value || "Showmaster";
    socket.emit("create-room", { 
      playerName: playerName,
      avatarId: currentAvatarId 
    });
    isGamemaster = true;
  });

  // Raum beitreten
  document.getElementById("join-room").addEventListener("click", () => {
    const inputName = document.getElementById("player-name").value;
    // Speichere den bereinigten Code direkt in der globalen Variable
    currentRoomCode = document.getElementById("room-code").value
      .toUpperCase()
      .replace(/\s/g, '');
    playerName = inputName;
    socket.emit("join-room", {
      roomCode: currentRoomCode, // Nutze direkt den bereinigten Code
      playerName: inputName,
      avatarId: currentAvatarId,
    });
    isGamemaster = false;
  });

  

  // Buzzer
  document.getElementById("buzzer").addEventListener("click", () => {
    console.log("Buzzer clicked, sending to room:", currentRoomCode); // Debug log
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
      console.log("Note changed, sending to room:", currentRoomCode); // Debug log
      if (!isGamemaster) {
        socket.emit("update-note", {
          roomCode: currentRoomCode,
          text: e.target.value,
          playerName: playerName
        });
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

  // Avatar Carousel Logik
  const prevBtn = document.querySelector(".prev");
  const nextBtn = document.querySelector(".next");
  const avatarImg = document.getElementById("selected-avatar");

  function updateAvatar(id) {
    currentAvatarId = id;
    avatarImg.src = `/assets/img/avatar_${id}.png`;
    avatarImg.dataset.avatarId = id;
  }

  prevBtn.addEventListener("click", () => {
    let newId = currentAvatarId - 1;
    if (newId < 1) newId = 20;
    updateAvatar(newId);
  });

  nextBtn.addEventListener("click", () => {
    let newId = currentAvatarId + 1;
    if (newId > 20) newId = 1;
    updateAvatar(newId);
  });

  window.addEventListener("beforeunload", (event) => {
    if (currentRoomCode) {
      // Nur warnen wenn in einem Raum
      event.preventDefault();
      // Chrome benötigt returnValue zu setzen
      event.returnValue = "Willst du den Raum wirklich verlassen?";
      return event.returnValue;
    }
  });

  const rollButton = document.getElementById('roll-button');
    if (rollButton) {
        rollButton.addEventListener('click', () => {
            if (isGamemaster) {
                const min = parseInt(document.getElementById('min-number').value) || 0;
                const max = parseInt(document.getElementById('max-number').value) || 100;
                console.log('Sending generate request:', { min, max });
                if (min > max) {
                    alert('Minimum must be less than maximum');
                    return;
                }
                
                socket.emit('generate-number', { 
                    roomCode: currentRoomCode,
                    min: min,
                    max: max 
                });
            }
        });
    }

  // Lock Answer Button für Spieler
  const lockAnswerBtn = document.getElementById("lock-answer");
  if (lockAnswerBtn) {
    lockAnswerBtn.addEventListener("click", () => {
      console.log("Locking answer for room:", currentRoomCode); // Debug log
      socket.emit("lock-player-answer", { 
        roomCode: currentRoomCode 
      });
    });
  }

  // Lock/Unlock All Buttons für Gamemaster
  const lockAllBtn = document.getElementById("lock-all-answers");
  const unlockAllBtn = document.getElementById("unlock-all-answers");
  
  if (lockAllBtn) {
    lockAllBtn.addEventListener("click", () => {
      socket.emit("lock-all-answers", { roomCode: currentRoomCode });
    });
  }
  
  if (unlockAllBtn) {
    unlockAllBtn.addEventListener("click", () => {
      socket.emit("unlock-all-answers", { roomCode: currentRoomCode });
    });
  }

});

// Socket Events
socket.on("room-created", (data) => {
  showGameInterface(data.roomCode, true);

  const leaderboard = document.getElementById("leaderboard");
  leaderboard.innerHTML = "<h3>Leaderboard</h3>";

  const noPlayersDiv = document.createElement("div");
  noPlayersDiv.className = "waiting-message"; // Neue Klasse hinzufügen
  noPlayersDiv.textContent =
    "Waiting for players. Share the room code to invite friends!";
  leaderboard.appendChild(noPlayersDiv);
});

socket.on("join-success", (data) => {
  showGameInterface(data.roomCode, false);
});

// In main.js - Leaderboard Erstellung ändern
socket.on("player-list-update", (players) => {
  

  const leaderboard = document.getElementById("leaderboard");
  leaderboard.innerHTML = "<h3>Leaderboard</h3>";

  const sortedPlayers = Object.values(players)
    .filter((player) => !player.isHost)
    .sort((a, b) => b.points - a.points);

  sortedPlayers.forEach((player, index) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = `leaderboard-item ${
      index < 3 ? "rank-" + (index + 1) : ""
    }`;

    playerDiv.innerHTML = `
          <div class="rank">#${index + 1}</div>
          <img class="player-avatar" src="/assets/img/avatar_${
            player.avatarId
          }.png" alt="Avatar">
          <div class="player-name">${player.name}</div>
          <div class="player-points">${player.points} Points</div>
          ${
            isGamemaster
              ? `
              <div class="point-controls">
                  <button class="plus-button" data-player="${player.id}">+100</button>
                  <button class="plus-button" data-player="${player.id}">+50</button>
                  <button class="plus-button" data-player="${player.id}">+10</button>
                  <button class="plus-button" data-player="${player.id}">+1</button>
                  <button class="minus-button" data-player="${player.id}">-1</button>
                  <button class="minus-button" data-player="${player.id}">-10</button>
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
      plusBtns[2].addEventListener("click", () => updatePoints(player.id, 10));
      plusBtns[3].addEventListener("click", () => updatePoints(player.id, 1));
      minusBtns[0].addEventListener("click", () =>
        updatePoints(player.id, -1)
      );
      minusBtns[1].addEventListener("click", () =>
        updatePoints(player.id, -10)
      );
      minusBtns[2].addEventListener("click", () =>
        updatePoints(player.id, -50)
      );
      minusBtns[3].addEventListener("click", () =>
        updatePoints(player.id, -100)
      );
    }

    leaderboard.appendChild(playerDiv);
  });

  if (sortedPlayers.length === 0) {
    const noPlayersDiv = document.createElement("div");
    noPlayersDiv.className = "waiting-message"; // Neue Klasse hinzufügen
    noPlayersDiv.textContent =
      "Waiting for players. Share the room code to invite friends!";
    leaderboard.appendChild(noPlayersDiv);
  }
});

// Sound-Funktionen anpassen
function playBuzzerSound() {
  if (!soundEnabled) return;
  const buzzerSound = document.getElementById("buzzer-sound");
  if (buzzerSound) {
    buzzerSound.currentTime = 0;
    buzzerSound.play();
  }
}

function playCountdownSound() {
  if (!soundEnabled) return;
  const countdownSound = document.getElementById("countdown-sound");
  if (countdownSound) {
    countdownSound.currentTime = 0;
    countdownSound.play();
  }
}

socket.on("buzzer-pressed", (data) => {
  // Buzzer Sound abspielen
  playBuzzerSound();

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
    buzzerStatus.innerHTML = "<div>Buzzers unlocked</div>";
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
    buzzerStatus.innerHTML = "<div>Buzzers locked</div>";
    buzzerStatus.classList.add("buzzer-free");
  } else {
    const buzzer = document.getElementById("buzzer");
    buzzer.disabled = true;
    buzzer.classList.remove("buzzer-active", "buzzer-winner");
    buzzer.classList.add("buzzer-disabled");
  }
});

socket.on("notes-update", (notes) => {
  if (isGamemaster) {
    const notesContainer = document.getElementById("all-player-notes");
    if (!notesContainer) return;

    notesContainer.innerHTML = "";

    Object.entries(notes).forEach(([playerId, data]) => {
      const noteDiv = document.createElement("div");
      noteDiv.className = "player-note-container";
      
      // Füge locked-Klasse hinzu wenn die Notiz gesperrt ist
      const textareaClass = data.locked ? "note-field locked" : "note-field";
      
      noteDiv.innerHTML = `
        <div class="player-note-header">${data.playerName || 'Unknown Player'}</div>
        <textarea class="${textareaClass}" readonly>${data.text || ""}</textarea>
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

// Timer Socket Events 
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
  // Display leeren statt 0 anzuzeigen
  const masterDisplay = document.getElementById("timer-display-master");
  const playerDisplay = document.getElementById("timer-display-player");
  if (masterDisplay) masterDisplay.innerHTML = '';
  if (playerDisplay) playerDisplay.innerHTML = '';

  // Textfeld wieder aktivieren und locked-Klasse entfernen
  const playerNote = document.getElementById("player-note");
  if (playerNote) {
    playerNote.disabled = false;
    playerNote.classList.remove("locked");
  }
  
  // Bei Gamemaster: locked-Klasse von allen Spieler-Notizen entfernen
  if (isGamemaster) {
    const playerNotes = document.querySelectorAll(".player-note-container textarea");
    playerNotes.forEach(textarea => {
      textarea.classList.remove("locked");
    });
  }
});

function updateTimerDisplay(seconds) {
  const masterDisplay = document.getElementById("timer-display-master");
  const playerDisplay = document.getElementById("timer-display-player");
  const playerNote = document.getElementById("player-note");

  // Countdown Sound bei 3 Sekunden
  if (seconds === 3) {
    playCountdownSound();
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
    
    // Spieler-Notiz sperren
    if (playerNote) {
      playerNote.disabled = true;
      playerNote.classList.add("locked");
    }
    
    // Bei Gamemaster: Alle Spieler-Notizen als gesperrt markieren
    if (isGamemaster) {
      const playerNotes = document.querySelectorAll(".player-note-container textarea");
      playerNotes.forEach(textarea => {
        textarea.classList.add("locked");
      });
    }
  }
}

socket.on('number-generated', (data) => {
  // Für Spieler
  const display = document.getElementById('random-number-display');
  if (display) {
      display.textContent = data.number;
  }
  
  // Für Gamemaster
  const gmDisplay = document.getElementById('random-number-display-gm');
  if (gmDisplay) {
      gmDisplay.textContent = data.number;
  }
});

// Socket Event Handler
socket.on("player-answer-locked", (data) => {
  if (!isGamemaster && socket.id === data.playerId) {
    const noteField = document.getElementById("player-note");
    if (noteField) {
      noteField.disabled = true;
      noteField.classList.add("locked");
    }
  }
});

socket.on("all-answers-locked", () => {
  if (!isGamemaster) {
    const noteField = document.getElementById("player-note");
    if (noteField) {
      noteField.disabled = true;
      noteField.classList.add("locked");
    }
  }
});

socket.on("all-answers-unlocked", () => {
  if (!isGamemaster) {
    const noteField = document.getElementById("player-note");
    if (noteField) {
      noteField.disabled = false;
      noteField.classList.remove("locked");
    }
  }
});

socket.on("room-error", (error) => {
  alert(error);
});

