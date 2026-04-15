const myId = 'p_' + Math.random().toString(36).substring(2, 9);
let myName   = '';
let roomCode = '';
let isHost   = false;
let roomRef  = null;
let selectedBoard = 'A';

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
  isHost   = true;

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
  myName   = document.getElementById('playerName').value.trim();
  roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();

  if (!myName)   { showToast('ENTER YOUR NAME FIRST'); return; }
  if (!roomCode) { showToast('ENTER A ROOM CODE');     return; }

  roomRef = db.ref(`jeopardy_rooms/${roomCode}`);

  roomRef.once('value', snap => {
    if (!snap.exists()) { showToast('ROOM NOT FOUND'); return; }

    const data        = snap.val();
    const playerCount = Object.keys(data.players || {}).length;

    if (playerCount >= 8) { showToast('ROOM IS FULL (MAX 8)'); return; }
    if (data.started)     { showToast('GAME ALREADY STARTED'); return; }

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
    setupBoardPicker();
  }

  roomRef.child('players').on('value', snap => {
    renderPlayerList(snap.val() || {});
  });

  roomRef.child('started').on('value', snap => {
    if (snap.val() === true) {
      window.location.href = `game.html?room=${roomCode}&pid=${myId}&name=${encodeURIComponent(myName)}&host=${isHost ? '1' : '0'}`;
    }
  });

  window.addEventListener('beforeunload', () => {
    if (roomRef && myId) {
      navigator.sendBeacon(
        `https://jeopardy-bc3e9-default-rtdb.europe-west1.firebasedatabase.app/jeopardy_rooms/${roomCode}/players/${myId}.json`,
        JSON.stringify(null)
      );
    }
  });
}

function setupBoardPicker() {
  document.querySelectorAll('.board-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.board-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedBoard = btn.dataset.board;
    });
  });

  document.querySelector('.board-option[data-board="A"]').classList.add('selected');
}

function renderPlayerList(players) {
  const list  = document.getElementById('playerList');
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

function startGame() {
  if (!isHost) return;

  roomRef.once('value', snap => {
    const count = Object.keys(snap.val()?.players || {}).length;
    if (count < 1) { showToast('NEED AT LEAST 1 PLAYER'); return; }

    const gameBoard = buildGameBoard(selectedBoard);

    const playerIds   = Object.keys(snap.val().players);
    const firstPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];

    const usedTiles = {};
    gameBoard.categories.forEach((_, ci) => {
      usedTiles[ci] = {};
    });

    roomRef.update({
      started:    true,
      phase:      'board-select',
      board:      gameBoard,
      activePlayer: firstPlayer,
      buzzedPlayer: null,
      currentTile:  null,
      buzzerOpen:   false,
      usedTiles
    });
  });
}

function leaveRoom() {
  if (roomRef) roomRef.child('players').child(myId).remove();
  showScreen('screen-lobby');
  roomRef = null;
}
