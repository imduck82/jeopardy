// lobby.js — Lobby / waiting room logic

console.log('[lobby.js] Script loaded');

// Identity stored only in sessionStorage — never exposed in URL
const myId = sessionStorage.getItem('jeo_pid') || ('p_' + Math.random().toString(36).substring(2, 9));
sessionStorage.setItem('jeo_pid', myId);

let myName = '';
let roomCode = '';
let isHost = false;
let roomRef = null;

let selectedBoardKey = 'A';
let selectedCategoriesA = new Set();
let selectedCategoriesB = new Set();
let categoriesFromDB = { A: null, B: null };

console.log('[lobby.js] myId:', myId);

// ─── Screen helpers ───────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

function showToast(msg) {
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

  // Store identity in sessionStorage — never in URL
  sessionStorage.setItem('jeo_room', roomCode);
  sessionStorage.setItem('jeo_name', myName);
  sessionStorage.setItem('jeo_host', '1');

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
    .then(function() { enterWaitingRoom(); })
    .catch(function(err) { console.error('[createRoom] Failed:', err); showToast('FAILED TO CREATE ROOM'); });
}

function joinRoom() {
  myName = document.getElementById('playerName').value.trim();
  roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!myName) { showToast('ENTER YOUR NAME FIRST'); return; }
  if (!roomCode) { showToast('ENTER A ROOM CODE'); return; }

  sessionStorage.setItem('jeo_room', roomCode);
  sessionStorage.setItem('jeo_name', myName);
  sessionStorage.setItem('jeo_host', '0');

  roomRef = db.ref('jeopardy_rooms/' + roomCode);
  roomRef.once('value', function(snap) {
    if (!snap.exists()) { showToast('ROOM NOT FOUND'); return; }
    const data = snap.val();
    if (Object.keys(data.players || {}).length >= 8) { showToast('ROOM IS FULL (MAX 8)'); return; }
    if (data.started) { showToast('GAME ALREADY STARTED'); return; }

    roomRef.child('players').child(myId).set({
      name: myName, score: 0, host: false, joinedAt: Date.now()
    }).then(function() { enterWaitingRoom(); })
      .catch(function(err) { console.error('[joinRoom] Failed:', err); showToast('FAILED TO JOIN ROOM'); });
  });
}

// ─── Waiting room ─────────────────────────────────────────────────────────────

function enterWaitingRoom() {
  showScreen('screen-waiting');
  document.getElementById('displayRoomCode').textContent = roomCode;

  if (isHost) {
    document.getElementById('hostControls').style.display = 'flex';
    renderBoardPicker();
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
      // Navigate with NO identity info in URL — game.js reads from sessionStorage
      window.location.href = 'game.html';
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

function deleteRoom() { if (roomRef) roomRef.remove(); }

function closeRoom() {
  if (!window.confirm('Are you sure you want to close the room?')) return;
  deleteRoom();
  showScreen('screen-lobby');
  roomRef = null;
}

// ─── Board picker (loads from Firebase) ──────────────────────────────────────

function renderBoardPicker() {
  const container = document.getElementById('boardPickerContainer');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;opacity:.7;">Loading categories...</div>';

  const loadA = categoriesFromDB.A ? Promise.resolve(categoriesFromDB.A)
    : fetchCategoryNames('A').then(function(n) { categoriesFromDB.A = n; return n; });
  const loadB = categoriesFromDB.B ? Promise.resolve(categoriesFromDB.B)
    : fetchCategoryNames('B').then(function(n) { categoriesFromDB.B = n; return n; });

  Promise.all([loadA, loadB])
    .then(function(results) { renderBoardPickerUI(results[0], results[1]); })
    .catch(function(err) {
      console.error('[renderBoardPicker] Failed:', err);
      container.innerHTML = '<div style="text-align:center;padding:20px;color:#ff4444;">Failed to load categories. Check Firebase.</div>';
    });
}

function renderBoardPickerUI(catNamesA, catNamesB) {
  const container = document.getElementById('boardPickerContainer');
  if (!container) return;
  const pvA = BOARD_POINT_VALUES.A;
  const pvB = BOARD_POINT_VALUES.B;

  function chipHtml(boardKey, name, selectedSet) {
    const sel = selectedSet.has(name) ? 'selected' : '';
    const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<div class="cat-chip ' + sel + '" onclick="toggleCategory(\'' + boardKey + '\',\'' + safe + '\')">' + name + '</div>';
  }

  container.innerHTML =
    '<div class="split-board-picker">' +
      '<div class="board-half">' +
        '<div class="board-half-header">' +
          '<span class="board-half-title">Board A</span>' +
          '<span class="board-half-sub">$' + pvA[0] + ' – $' + pvA[pvA.length-1] + '</span>' +
          '<button class="board-half-select-btn ' + (selectedBoardKey==='A'?'active':'') + '" onclick="selectBoard(\'A\')">' + (selectedBoardKey==='A'?'✓ Selected':'Select') + '</button>' +
        '</div>' +
        '<div class="category-grid">' + catNamesA.map(function(n){return chipHtml('A',n,selectedCategoriesA);}).join('') + '</div>' +
        '<div class="cat-count">' + selectedCategoriesA.size + ' selected</div>' +
      '</div>' +
      '<div class="board-divider"></div>' +
      '<div class="board-half">' +
        '<div class="board-half-header">' +
          '<span class="board-half-title">Board B</span>' +
          '<span class="board-half-sub">$' + pvB[0] + ' – $' + pvB[pvB.length-1] + '</span>' +
          '<button class="board-half-select-btn ' + (selectedBoardKey==='B'?'active':'') + '" onclick="selectBoard(\'B\')">' + (selectedBoardKey==='B'?'✓ Selected':'Select') + '</button>' +
        '</div>' +
        '<div class="category-grid">' + catNamesB.map(function(n){return chipHtml('B',n,selectedCategoriesB);}).join('') + '</div>' +
        '<div class="cat-count">' + selectedCategoriesB.size + ' selected</div>' +
      '</div>' +
    '</div>';
}

function selectBoard(key) {
  selectedBoardKey = key;
  if (categoriesFromDB.A && categoriesFromDB.B) renderBoardPickerUI(categoriesFromDB.A, categoriesFromDB.B);
  else renderBoardPicker();
}

function toggleCategory(boardKey, name) {
  const set = boardKey === 'A' ? selectedCategoriesA : selectedCategoriesB;
  set.has(name) ? set.delete(name) : set.add(name);
  if (categoriesFromDB.A && categoriesFromDB.B) renderBoardPickerUI(categoriesFromDB.A, categoriesFromDB.B);
  else renderBoardPicker();
}

function renderPlayerList(players) {
  const list = document.getElementById('playerList');
  const count = Object.keys(players).length;
  list.innerHTML = Object.entries(players)
    .sort(function(a, b) { return a[1].joinedAt - b[1].joinedAt; })
    .map(function(e) { return '<div class="player-chip ' + (e[1].host?'host':'') + '">' + e[1].name + '</div>'; })
    .join('');
  document.getElementById('playerCount').textContent = count + ' PLAYER' + (count!==1?'S':'') + ' IN LOBBY';
}

// ─── Start game ───────────────────────────────────────────────────────────────

async function startGame() {
  if (!isHost) return;
  const activeSet = selectedBoardKey === 'A' ? selectedCategoriesA : selectedCategoriesB;
  if (activeSet.size < 6) { showToast('SELECT AT LEAST 6 CATEGORIES FOR BOARD ' + selectedBoardKey); return; }

  const snap = await roomRef.once('value');
  const data = snap.val();
  const nonHostPlayers = Object.values(data && data.players ? data.players : {}).filter(function(p) { return !p.host; });
  if (nonHostPlayers.length < 1) { showToast('NEED AT LEAST 1 PLAYER'); return; }

  const selectedNames = Array.from(activeSet).slice(0, 6);

  let categoriesData;
  try {
    categoriesData = await fetchQuestions(selectedBoardKey, selectedNames);
  } catch (err) {
    console.error('[startGame] fetchQuestions failed:', err);
    showToast('FAILED TO LOAD QUESTIONS');
    return;
  }

  const gameBoard = buildGameBoard(selectedBoardKey, selectedNames, categoriesData);
  if (!gameBoard) { showToast('FAILED TO BUILD GAME BOARD'); return; }

  const nonHostIds = Object.entries(data.players)
    .filter(function(e) { return !e[1].host; })
    .map(function(e) { return e[0]; });
  const firstPlayer = nonHostIds[Math.floor(Math.random() * nonHostIds.length)];

  const usedTiles = {};
  gameBoard.categories.forEach(function(_, ci) { usedTiles[ci] = {}; });

  const questionsPayload = {};
  categoriesData.forEach(function(cat, ci) { questionsPayload[ci] = cat.questions; });

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
  }).catch(function(err) { console.error('[startGame] Firebase error:', err); showToast('FAILED TO START GAME'); });
}

// ─── Leave ────────────────────────────────────────────────────────────────────

function leaveRoom() {
  if (roomRef) roomRef.child('players').child(myId).remove();
  showScreen('screen-lobby');
  roomRef = null;
}

console.log('[lobby.js] Ready');
