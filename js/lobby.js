// lobby.js — Lobby / waiting room logic
// Depends on: firebase.js (db), boards.js (fetchCategoryNames, fetchQuestions, buildGameBoard)

console.log('[lobby.js] Script loaded');

const myId = 'p_' + Math.random().toString(36).substring(2, 9);
let myName = '';
let roomCode = '';
let isHost = false;
let roomRef = null;

let selectedBoardKey = 'A';
let selectedCategoriesA = new Set();
let selectedCategoriesB = new Set();

// Cache of categories loaded from Firebase
let categoriesFromDB = { A: null, B: null };

console.log('[lobby.js] myId assigned:', myId);

// ─── Screen helpers ───────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

function showToast(msg) {
  console.log('[showToast]', msg);
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 3000);
}

// ─── Room creation / joining ──────────────────────────────────────────────────

function createRoom() {
  myName = document.getElementById('playerName').value.trim();
  if (!myName) { showToast('ENTER YOUR NAME FIRST'); return; }

  roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
  isHost = true;
  console.log('[createRoom] roomCode:', roomCode);

  const initialState = {
    phase: 'lobby',
    host: myId,
    started: false,
    players: {
      [myId]: { name: myName, score: 0, host: true, joinedAt: Date.now() }
    }
  };

  roomRef = db.ref('jeopardy_rooms/' + roomCode);
  roomRef.set(initialState)
    .then(function() {
      console.log('[createRoom] Room created:', roomCode);
      enterWaitingRoom();
    })
    .catch(function(err) {
      console.error('[createRoom] Failed:', err);
      showToast('FAILED TO CREATE ROOM');
    });
}

function joinRoom() {
  myName = document.getElementById('playerName').value.trim();
  roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!myName) { showToast('ENTER YOUR NAME FIRST'); return; }
  if (!roomCode) { showToast('ENTER A ROOM CODE'); return; }

  roomRef = db.ref('jeopardy_rooms/' + roomCode);
  roomRef.once('value', function(snap) {
    if (!snap.exists()) { showToast('ROOM NOT FOUND'); return; }

    const data = snap.val();
    const playerCount = Object.keys(data.players || {}).length;
    if (playerCount >= 8) { showToast('ROOM IS FULL (MAX 8)'); return; }
    if (data.started) { showToast('GAME ALREADY STARTED'); return; }

    roomRef.child('players').child(myId).set({
      name: myName, score: 0, host: false, joinedAt: Date.now()
    }).then(function() {
      console.log('[joinRoom] Joined room:', roomCode);
      enterWaitingRoom();
    }).catch(function(err) {
      console.error('[joinRoom] Failed:', err);
      showToast('FAILED TO JOIN ROOM');
    });
  });
}

// ─── Waiting room ─────────────────────────────────────────────────────────────

function enterWaitingRoom() {
  console.log('[enterWaitingRoom] isHost:', isHost);
  showScreen('screen-waiting');
  document.getElementById('displayRoomCode').textContent = roomCode;

  const hostControls = document.getElementById('hostControls');
  if (isHost) {
    hostControls.style.display = 'flex';
    renderBoardPicker(); // shows loading state, then loads from Firebase
  }

  roomRef.child('players').on('value', function(snap) {
    const players = snap.val() || {};
    renderPlayerList(players);

    if (!isHost) {
      const hostStillHere = Object.values(players).some(function(p) { return p.host; });
      if (!hostStillHere && Object.keys(players).length > 0) {
        showToast('HOST LEFT — ROOM CLOSED');
        setTimeout(function() { leaveRoom(); }, 1500);
      }
    }
  });

  roomRef.child('started').on('value', function(snap) {
    if (snap.val() === true) {
      const url = 'game.html?room=' + roomCode + '&pid=' + myId + '&name=' + encodeURIComponent(myName) + '&host=' + (isHost ? '1' : '0');
      console.log('[waitingRoom] Redirecting to:', url);
      window.location.href = url;
    }
  });

  window.addEventListener('beforeunload', function() {
    if (isHost) {
      navigator.sendBeacon(
        'https://jeopardy-bc3e9-default-rtdb.europe-west1.firebasedatabase.app/jeopardy_rooms/' + roomCode + '.json',
        JSON.stringify(null)
      );
    } else if (roomRef && myId) {
      navigator.sendBeacon(
        'https://jeopardy-bc3e9-default-rtdb.europe-west1.firebasedatabase.app/jeopardy_rooms/' + roomCode + '/players/' + myId + '.json',
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

// ─── Board picker (loads categories from Firebase) ─────────────────────────────

function renderBoardPicker() {
  const container = document.getElementById('boardPickerContainer');
  if (!container) return;

  // Show loading state while we fetch from Firebase
  container.innerHTML = '<div style="text-align:center; padding: 20px; opacity:0.7;">Loading categories from database...</div>';

  // Load both boards concurrently
  const loadA = categoriesFromDB.A
    ? Promise.resolve(categoriesFromDB.A)
    : fetchCategoryNames('A').then(function(names) { categoriesFromDB.A = names; return names; });

  const loadB = categoriesFromDB.B
    ? Promise.resolve(categoriesFromDB.B)
    : fetchCategoryNames('B').then(function(names) { categoriesFromDB.B = names; return names; });

  Promise.all([loadA, loadB])
    .then(function(results) {
      console.log('[renderBoardPicker] Loaded categories — A:', results[0].length, 'B:', results[1].length);
      renderBoardPickerUI(results[0], results[1]);
    })
    .catch(function(err) {
      console.error('[renderBoardPicker] Failed to load categories:', err);
      container.innerHTML = '<div style="text-align:center; padding: 20px; color: #ff4444;">Failed to load categories. Check your Firebase connection.</div>';
    });
}

function renderBoardPickerUI(catNamesA, catNamesB) {
  const container = document.getElementById('boardPickerContainer');
  if (!container) return;

  const pvA = (BOARD_POINT_VALUES && BOARD_POINT_VALUES.A) ? BOARD_POINT_VALUES.A : [100, 200, 300, 400, 500];
  const pvB = (BOARD_POINT_VALUES && BOARD_POINT_VALUES.B) ? BOARD_POINT_VALUES.B : [200, 400, 600, 800, 1000];

  container.innerHTML =
    '<div class="split-board-picker">' +
      '<div class="board-half">' +
        '<div class="board-half-header">' +
          '<span class="board-half-title">Board A</span>' +
          '<span class="board-half-sub">$' + pvA[0] + ' – $' + pvA[pvA.length - 1] + '</span>' +
          '<button class="board-half-select-btn ' + (selectedBoardKey === 'A' ? 'active' : '') + '" onclick="selectBoard(\'A\')">' +
            (selectedBoardKey === 'A' ? '✓ Selected' : 'Select') +
          '</button>' +
        '</div>' +
        '<div class="category-grid" id="catGridA">' +
          catNamesA.map(function(name) {
            return '<div class="cat-chip ' + (selectedCategoriesA.has(name) ? 'selected' : '') + '" onclick="toggleCategory(\'A\', \'' + name.replace(/'/g, "\\'") + '\')">' + name + '</div>';
          }).join('') +
        '</div>' +
        '<div class="cat-count" id="catCountA">' + selectedCategoriesA.size + ' selected</div>' +
      '</div>' +
      '<div class="board-divider"></div>' +
      '<div class="board-half">' +
        '<div class="board-half-header">' +
          '<span class="board-half-title">Board B</span>' +
          '<span class="board-half-sub">$' + pvB[0] + ' – $' + pvB[pvB.length - 1] + '</span>' +
          '<button class="board-half-select-btn ' + (selectedBoardKey === 'B' ? 'active' : '') + '" onclick="selectBoard(\'B\')">' +
            (selectedBoardKey === 'B' ? '✓ Selected' : 'Select') +
          '</button>' +
        '</div>' +
        '<div class="category-grid" id="catGridB">' +
          catNamesB.map(function(name) {
            return '<div class="cat-chip ' + (selectedCategoriesB.has(name) ? 'selected' : '') + '" onclick="toggleCategory(\'B\', \'' + name.replace(/'/g, "\\'") + '\')">' + name + '</div>';
          }).join('') +
        '</div>' +
        '<div class="cat-count" id="catCountB">' + selectedCategoriesB.size + ' selected</div>' +
      '</div>' +
    '</div>';
}

function selectBoard(key) {
  console.log('[selectBoard] Selected board:', key);
  selectedBoardKey = key;
  // Re-render with cached data (already loaded)
  if (categoriesFromDB.A && categoriesFromDB.B) {
    renderBoardPickerUI(categoriesFromDB.A, categoriesFromDB.B);
  } else {
    renderBoardPicker();
  }
}

function toggleCategory(boardKey, name) {
  const set = boardKey === 'A' ? selectedCategoriesA : selectedCategoriesB;
  if (set.has(name)) {
    set.delete(name);
  } else {
    set.add(name);
  }
  // Re-render with cached data
  if (categoriesFromDB.A && categoriesFromDB.B) {
    renderBoardPickerUI(categoriesFromDB.A, categoriesFromDB.B);
  } else {
    renderBoardPicker();
  }
}

function renderPlayerList(players) {
  const list = document.getElementById('playerList');
  const count = Object.keys(players).length;

  list.innerHTML = Object.entries(players)
    .sort(function(a, b) { return a[1].joinedAt - b[1].joinedAt; })
    .map(function(entry) {
      const p = entry[1];
      return '<div class="player-chip ' + (p.host ? 'host' : '') + '">' + p.name + '</div>';
    }).join('');

  document.getElementById('playerCount').textContent =
    count + ' PLAYER' + (count !== 1 ? 'S' : '') + ' IN LOBBY';
}

// ─── Start game ───────────────────────────────────────────────────────────────

async function startGame() {
  console.log('[startGame] Host initiated game start');
  if (!isHost) return;

  const activeSet = selectedBoardKey === 'A' ? selectedCategoriesA : selectedCategoriesB;
  console.log('[startGame] Active board:', selectedBoardKey, '| selected categories:', activeSet.size);

  if (activeSet.size < 6) {
    showToast('SELECT AT LEAST 6 CATEGORIES FOR BOARD ' + selectedBoardKey);
    return;
  }

  const snap = await roomRef.once('value');
  const data = snap.val();
  const nonHostPlayers = Object.values(data && data.players ? data.players : {}).filter(function(p) { return !p.host; });
  if (nonHostPlayers.length < 1) { showToast('NEED AT LEAST 1 PLAYER'); return; }

  // Take exactly 6 from the selected set — in their original selection order (no random shuffle)
  const selectedNames = Array.from(activeSet).slice(0, 6);
  console.log('[startGame] Using 6 categories:', selectedNames);

  let categoriesData;
  try {
    categoriesData = await fetchQuestions(selectedBoardKey, selectedNames);
    console.log('[startGame] fetchQuestions returned', categoriesData.length, 'categories');
  } catch (err) {
    console.error('[startGame] fetchQuestions failed:', err);
    showToast('FAILED TO LOAD QUESTIONS');
    return;
  }

  const gameBoard = buildGameBoard(selectedBoardKey, selectedNames, categoriesData);
  if (!gameBoard) {
    showToast('FAILED TO BUILD GAME BOARD');
    return;
  }
  console.log('[startGame] Game board built:', gameBoard);

  const nonHostIds = Object.entries(data.players)
    .filter(function(e) { return !e[1].host; })
    .map(function(e) { return e[0]; });
  const firstPlayer = nonHostIds[Math.floor(Math.random() * nonHostIds.length)];
  console.log('[startGame] First active player:', firstPlayer);

  const usedTiles = {};
  gameBoard.categories.forEach(function(_, ci) { usedTiles[ci] = {}; });

  const questionsPayload = {};
  categoriesData.forEach(function(cat, ci) {
    questionsPayload[ci] = cat.questions;
    console.log('[startGame] questionsPayload[' + ci + '] "' + cat.name + '" — ' + cat.questions.length + ' questions');
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
    usedTiles: usedTiles
  }).then(function() {
    console.log('[startGame] Firebase update succeeded — game started');
  }).catch(function(err) {
    console.error('[startGame] Firebase update failed:', err);
    showToast('FAILED TO START GAME');
  });
}

// ─── Leave ────────────────────────────────────────────────────────────────────

function leaveRoom() {
  if (roomRef) roomRef.child('players').child(myId).remove();
  showScreen('screen-lobby');
  roomRef = null;
}

console.log('[lobby.js] Ready');
