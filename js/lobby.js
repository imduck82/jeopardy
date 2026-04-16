const myId = 'p_' + Math.random().toString(36).substring(2, 9);
let myName = '';
let roomCode = '';
let isHost = false;
let roomRef = null;

let selectedBoardKey = 'A';
let selectedCategoriesA = new Set();
let selectedCategoriesB = new Set();

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function createRoom() {
  myName = document.getElementById('playerName').value.trim();
  if (!myName) { showToast('ENTER YOUR NAME FIRST'); return; }

  roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
  isHost = true;

  const initialState = {
    phase: 'lobby',
    host: myId,
    started: false,
    players: {
      [myId]: { name: myName, score: 0, host: true, joinedAt: Date.now() }
    }
  };

  roomRef = db.ref(`jeopardy_rooms/${roomCode}`);

  roomRef.set(initialState)
    .then(() => enterWaitingRoom())
    .catch(() => showToast('FAILED TO CREATE ROOM'));
}

function joinRoom() {
  myName = document.getElementById('playerName').value.trim();
  roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();

  if (!myName) { showToast('ENTER YOUR NAME FIRST'); return; }
  if (!roomCode) { showToast('ENTER A ROOM CODE'); return; }

  roomRef = db.ref(`jeopardy_rooms/${roomCode}`);

  roomRef.once('value', snap => {
    if (!snap.exists()) { showToast('ROOM NOT FOUND'); return; }

    const data = snap.val();
    const playerCount = Object.keys(data.players || {}).length;

    if (playerCount >= 8) { showToast('ROOM IS FULL (MAX 8)'); return; }
    if (data.started) { showToast('GAME ALREADY STARTED'); return; }

    roomRef.child('players').child(myId).set({
      name: myName, score: 0, host: false, joinedAt: Date.now()
    }).then(() => enterWaitingRoom());
  });
}

function enterWaitingRoom() {
  showScreen('screen-waiting');
  document.getElementById('displayRoomCode').textContent = roomCode;

  const hostControls = document.getElementById('hostControls');
  if (isHost) {
    hostControls.style.display = 'flex';
    renderBoardPicker();
  }

  roomRef.child('players').on('value', snap => {
    const players = snap.val() || {};
    renderPlayerList(players);

    if (isHost) {
      const nonHostCount = Object.values(players).filter(p => !p.host).length;
      if (nonHostCount === 0 && Object.keys(players).length === 0) {
        deleteRoom();
      }
    } else {
      const hostStillHere = Object.values(players).some(p => p.host);
      if (!hostStillHere && Object.keys(players).length > 0) {
        showToast('HOST LEFT — ROOM CLOSED');
        setTimeout(() => { leaveRoom(); }, 1500);
      }
    }
  });

  roomRef.child('started').on('value', snap => {
    if (snap.val() === true) {
      window.location.href = `game.html?room=${roomCode}&pid=${myId}&name=${encodeURIComponent(myName)}&host=${isHost ? '1' : '0'}`;
    }
  });

  window.addEventListener('beforeunload', () => {
    if (isHost) {
      navigator.sendBeacon(
        `https://jeopardy-bc3e9-default-rtdb.europe-west1.firebasedatabase.app/jeopardy_rooms/${roomCode}.json`,
        JSON.stringify(null)
      );
    } else if (roomRef && myId) {
      navigator.sendBeacon(
        `https://jeopardy-bc3e9-default-rtdb.europe-west1.firebasedatabase.app/jeopardy_rooms/${roomCode}/players/${myId}.json`,
        JSON.stringify(null)
      );
    }
  });
}

function deleteRoom() {
  if (roomRef) roomRef.remove();
}

function closeRoom() {
  const confirmed = window.confirm('Are you sure you want to close the room? All players will be kicked.');
  if (!confirmed) return;
  deleteRoom();
  showScreen('screen-lobby');
  roomRef = null;
}

function renderBoardPicker() {
  const container = document.getElementById('boardPickerContainer');
  if (!container) return;

  const boardA = ALL_CATEGORIES.A;
  const boardB = ALL_CATEGORIES.B;

  container.innerHTML = `
    <div class="split-board-picker">
      <div class="board-half">
        <div class="board-half-header">
          <span class="board-half-title">Board A</span>
          <span class="board-half-sub">$${boardA.pointValues[0]} – $${boardA.pointValues[boardA.pointValues.length - 1]}</span>
          <button class="board-half-select-btn ${selectedBoardKey === 'A' ? 'active' : ''}" onclick="selectBoard('A')">
            ${selectedBoardKey === 'A' ? '✓ Selected' : 'Select'}
          </button>
        </div>
        <div class="category-grid" id="catGridA">
          ${boardA.categories.map(name => `
            <div class="cat-chip ${selectedCategoriesA.has(name) ? 'selected' : ''}"
                 onclick="toggleCategory('A', '${name}')">${name}</div>
          `).join('')}
        </div>
        <div class="cat-count" id="catCountA">${selectedCategoriesA.size} selected</div>
      </div>
      <div class="board-divider"></div>
      <div class="board-half">
        <div class="board-half-header">
          <span class="board-half-title">Board B</span>
          <span class="board-half-sub">$${boardB.pointValues[0]} – $${boardB.pointValues[boardB.pointValues.length - 1]}</span>
          <button class="board-half-select-btn ${selectedBoardKey === 'B' ? 'active' : ''}" onclick="selectBoard('B')">
            ${selectedBoardKey === 'B' ? '✓ Selected' : 'Select'}
          </button>
        </div>
        <div class="category-grid" id="catGridB">
          ${boardB.categories.map(name => `
            <div class="cat-chip ${selectedCategoriesB.has(name) ? 'selected' : ''}"
                 onclick="toggleCategory('B', '${name}')">${name}</div>
          `).join('')}
        </div>
        <div class="cat-count" id="catCountB">${selectedCategoriesB.size} selected</div>
      </div>
    </div>
  `;
}

function selectBoard(key) {
  selectedBoardKey = key;
  renderBoardPicker();
}

function toggleCategory(boardKey, name) {
  const set = boardKey === 'A' ? selectedCategoriesA : selectedCategoriesB;
  if (set.has(name)) {
    set.delete(name);
  } else {
    set.add(name);
  }
  renderBoardPicker();
}

function renderPlayerList(players) {
  const list = document.getElementById('playerList');
  const count = Object.keys(players).length;

  list.innerHTML = Object.entries(players)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([, p]) => `
      <div class="player-chip ${p.host ? 'host' : ''}">
        ${p.name}
      </div>
    `).join('');

  document.getElementById('playerCount').textContent =
    `${count} PLAYER${count !== 1 ? 'S' : ''} IN LOBBY`;
}

async function startGame() {
  if (!isHost) return;

  const activeSet = selectedBoardKey === 'A' ? selectedCategoriesA : selectedCategoriesB;
  if (activeSet.size < 6) {
    showToast(`SELECT AT LEAST 6 CATEGORIES FOR BOARD ${selectedBoardKey}`);
    return;
  }

  roomRef.once('value', async snap => {
    const data = snap.val();
    const nonHostPlayers = Object.values(data?.players || {}).filter(p => !p.host);
    if (nonHostPlayers.length < 1) { showToast('NEED AT LEAST 1 PLAYER'); return; }

    const selectedNames = [...activeSet];
    const pick = selectedNames.sort(() => Math.random() - 0.5).slice(0, 6);

    let categoriesData;
    try {
      categoriesData = await fetchQuestions(selectedBoardKey, pick);
    } catch {
      showToast('FAILED TO LOAD QUESTIONS');
      return;
    }

    const gameBoard = buildGameBoard(selectedBoardKey, pick, categoriesData);

    const nonHostIds = Object.entries(data.players)
      .filter(([, p]) => !p.host)
      .map(([id]) => id);
    const firstPlayer = nonHostIds[Math.floor(Math.random() * nonHostIds.length)];

    const usedTiles = {};
    gameBoard.categories.forEach((_, ci) => { usedTiles[ci] = {}; });

    const questionsPayload = {};
    categoriesData.forEach((cat, ci) => {
      questionsPayload[ci] = cat.questions;
    });

    roomRef.update({
      started: true,
      phase: 'board-select',
      board: gameBoard,
      questions: questionsPayload,
      activePlayer: firstPlayer,
      buzzedPlayer: null,
      currentTile: null,
      buzzerOpen: false,
      usedTiles
    });
  });
}

function leaveRoom() {
  if (roomRef) roomRef.child('players').child(myId).remove();
  showScreen('screen-lobby');
  roomRef = null;
}
