const params   = new URLSearchParams(window.location.search);
const roomCode = params.get('room');
const myId     = params.get('pid');
const myName   = decodeURIComponent(params.get('name') || 'Player');
const isHost   = params.get('host') === '1';

if (!roomCode) window.location.href = 'index.html';

const roomRef = db.ref(`jeopardy_rooms/${roomCode}`);
let state = {};

function initGame() {
  document.getElementById('gameRoomCode').textContent = roomCode;
  document.getElementById('myNameDisplay').textContent = myName;

  roomRef.on('value', snap => {
    if (!snap.exists()) { window.location.href = 'index.html'; return; }
    state = snap.val();
    render();
  });

  window.addEventListener('beforeunload', () => {
    roomRef.child('players').child(myId).remove();
  });
}

function render() {
  if (!state.board) return;

  renderScoreboard();
  renderTurnBanner();

  const phase = state.phase;

  if (phase === 'board-select') {
    showPanel('panel-board');
    isHost ? renderBoardWithDD() : renderBoard();
    if (isHost) renderAdminBoardSelect();

  } else if (phase === 'question-reveal') {
    showPanel('panel-question');
    renderQuestionPanel();
    if (isHost) renderAdminQuestion();

  } else if (phase === 'daily-double') {
    showPanel('panel-daily-double');
    renderDailyDoublePanel();
    if (isHost) renderAdminDailyDouble();

  } else if (phase === 'judging') {
    showPanel('panel-question');
    renderQuestionPanel();
    if (isHost) renderAdminQuestion();

  } else if (phase === 'game-over') {
    showPanel('panel-gameover');
    renderGameOver();
  }
}

function showPanel(id) {
  document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function renderTurnBanner() {
  const banner = document.getElementById('turn-banner');
  if (!banner || !state.players || !state.activePlayer) return;

  const active = state.players[state.activePlayer];
  if (!active) return;

  const isMe = state.activePlayer === myId;
  banner.textContent = isMe ? 'Your turn — pick a question' : `${active.name}'s turn`;
  banner.className   = 'turn-banner' + (isMe ? ' my-turn' : '');
}

function renderScoreboard() {
  const board = document.getElementById('scoreboard');
  if (!board || !state.players) return;

  const sorted = Object.entries(state.players)
    .sort((a, b) => b[1].score - a[1].score);

  board.innerHTML = sorted.map(([pid, p]) => `
    <div class="score-entry
      ${pid === myId ? 'me' : ''}
      ${p.host ? 'is-host' : ''}
      ${pid === state.activePlayer ? 'active-turn' : ''}">
      <span class="score-name">${p.name}${p.host ? ' ★' : ''}</span>
      <span class="score-val">$${(p.score || 0).toLocaleString()}</span>
    </div>
  `).join('');
}

function renderBoard() {
  const area = document.getElementById('board-grid');
  if (!area || !state.board) return;

  const { board }  = state;
  const categories = board.categories;
  const values     = board.pointValues;

  let html = '<div class="jeopardy-board">';

  categories.forEach((cat, ci) => {
    html += `<div class="board-col">
      <div class="board-cell cat-header">${cat.name}</div>`;

    values.forEach((val, row) => {
      const qi   = cat.questionOrder[row];
      const used = state.usedTiles?.[ci]?.[qi];

      html += `<div class="board-cell val-cell ${used ? 'used' : ''}"
        ${!used ? `onclick="selectTile(${ci}, ${qi}, ${row})"` : ''}>
        ${used ? '' : `$${val}`}
      </div>`;
    });

    html += '</div>';
  });

  html += '</div>';
  area.innerHTML = html;
}

function renderBoardWithDD() {
  const area = document.getElementById('board-grid');
  if (!area || !state.board) return;

  const { board }  = state;
  const categories = board.categories;
  const values     = board.pointValues;
  const dd         = board.dailyDouble;

  let html = '<div class="jeopardy-board">';

  categories.forEach((cat, ci) => {
    html += `<div class="board-col">
      <div class="board-cell cat-header">${cat.name}</div>`;

    values.forEach((val, row) => {
      const qi   = cat.questionOrder[row];
      const used = state.usedTiles?.[ci]?.[qi];
      const isDD = dd.catIndex === ci && dd.qIndex === qi;

      html += `<div class="board-cell val-cell ${used ? 'used' : ''} ${isDD ? 'daily-double-marker' : ''}"
        ${!used ? `onclick="selectTile(${ci}, ${qi}, ${row})"` : ''}>
        ${used ? '' : isDD ? `<span class="dd-star">★</span>$${val}` : `$${val}`}
      </div>`;
    });

    html += '</div>';
  });

  html += '</div>';
  area.innerHTML = html;
}

function selectTile(catIndex, qIndex, row) {
  if (state.phase !== 'board-select') return;
  if (state.activePlayer !== myId && !isHost) return;

  const dd   = state.board.dailyDouble;
  const isDD = dd.catIndex === catIndex && dd.qIndex === qIndex;

  roomRef.update({
    currentTile:  { catIndex, qIndex, row },
    phase:        isDD ? 'daily-double' : 'question-reveal',
    buzzedPlayer: null,
    buzzerOpen:   false,
    ddWager:      null
  });
}

function renderQuestionPanel() {
  if (!state.currentTile || !state.board) return;

  const { catIndex, qIndex, row } = state.currentTile;
  const boardData = BOARDS[state.board.boardKey];
  const category  = boardData.categories[catIndex];
  const question  = category.questions[qIndex];
  const value     = state.board.pointValues[row];

  document.getElementById('q-category').textContent = category.name;
  document.getElementById('q-value').textContent    = `$${value}`;
  document.getElementById('q-text').textContent     = question.q;

  const buzzerEl   = document.getElementById('player-buzzer');
  const statusEl   = document.getElementById('buzzer-status');
  const judgingEl  = document.getElementById('judging-info');

  const buzzed    = state.buzzedPlayer;
  const isJudging = state.phase === 'judging';

  if (isJudging && buzzed && state.players?.[buzzed]) {
    if (buzzerEl)  buzzerEl.style.display  = 'none';
    if (statusEl)  statusEl.style.display  = 'none';
    if (judgingEl) {
      judgingEl.style.display  = 'block';
      judgingEl.textContent    = `${state.players[buzzed].name} is answering...`;
    }
  } else {
    if (judgingEl) judgingEl.style.display = 'none';

    if (!isHost && buzzerEl) {
      const canBuzz  = state.buzzerOpen && !buzzed;
      const isBuzzed = buzzed === myId;

      buzzerEl.style.display = 'block';
      buzzerEl.disabled      = !canBuzz || !!buzzed;
      buzzerEl.textContent   = isBuzzed ? 'You buzzed in!' : canBuzz ? 'BUZZ IN' : 'Wait...';
      buzzerEl.className     = 'buzzer-btn' + (isBuzzed ? ' buzzed' : canBuzz ? ' ready' : '');
    } else if (isHost && buzzerEl) {
      buzzerEl.style.display = 'none';
    }

    if (statusEl) {
      if (buzzed && state.players?.[buzzed]) {
        statusEl.textContent = `${state.players[buzzed].name} buzzed in!`;
        statusEl.className   = 'buzzer-status active';
      } else if (state.buzzerOpen) {
        statusEl.textContent = 'Buzzers are open!';
        statusEl.className   = 'buzzer-status open';
      } else {
        statusEl.textContent = 'Waiting for host...';
        statusEl.className   = 'buzzer-status';
      }
    }
  }
}

function playerBuzz() {
  if (isHost || !state.buzzerOpen || state.buzzedPlayer) return;

  roomRef.update({
    buzzedPlayer: myId,
    phase: 'judging'
  });
}

function renderDailyDoublePanel() {
  if (!state.currentTile || !state.board) return;

  const { catIndex, qIndex, row } = state.currentTile;
  const boardData  = BOARDS[state.board.boardKey];
  const category   = boardData.categories[catIndex];
  const question   = category.questions[qIndex];
  const isActive   = state.activePlayer === myId && !isHost;
  const wager      = state.ddWager;

  document.getElementById('dd-category').textContent = category.name;

  const waitingMsg  = document.getElementById('dd-waiting-msg');
  const wagerArea   = document.getElementById('dd-wager-area');
  const questionArea = document.getElementById('dd-question-area');

  if (wager) {
    if (waitingMsg)   waitingMsg.style.display   = 'none';
    if (wagerArea)    wagerArea.style.display     = 'none';
    if (questionArea) {
      questionArea.style.display = 'block';
      document.getElementById('dd-question-text').textContent = question.q;
    }
  } else if (isActive) {
    if (waitingMsg)   waitingMsg.style.display   = 'none';
    if (questionArea) questionArea.style.display = 'none';
    if (wagerArea)    wagerArea.style.display     = 'block';
  } else {
    if (wagerArea)    wagerArea.style.display     = 'none';
    if (questionArea) questionArea.style.display  = 'none';
    if (waitingMsg)   waitingMsg.style.display    = 'block';
  }
}

function submitWager() {
  if (state.activePlayer !== myId || isHost) return;

  const input  = document.getElementById('dd-wager-input');
  const val    = parseInt(input?.value || '0', 10);
  const score  = state.players?.[myId]?.score || 0;
  const maxBet = state.board.pointValues[state.board.pointValues.length - 1];
  const max    = Math.max(score, maxBet);

  if (isNaN(val) || val < 1 || val > max) {
    showToast(`BET BETWEEN $1 AND $${max}`);
    return;
  }

  roomRef.update({ ddWager: val });
}

function renderAdminBoardSelect() {
  const panel = document.getElementById('admin-panel');
  if (!panel) return;

  const { board } = state;
  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-label">Active: ${BOARDS[board.boardKey].label}</div>
      <div class="admin-label" style="margin-top:6px; opacity:.7;">
        ★ = Daily Double location (only you see this)
      </div>
    </div>
  `;
}

function renderAdminQuestion() {
  const panel = document.getElementById('admin-panel');
  if (!panel || !state.currentTile || !state.board) return;

  const { catIndex, qIndex, row } = state.currentTile;
  const boardData = BOARDS[state.board.boardKey];
  const question  = boardData.categories[catIndex].questions[qIndex];
  const value     = state.board.pointValues[row];
  const buzzed    = state.buzzedPlayer;

  let actionsHtml = '';

  if (!state.buzzerOpen && !buzzed) {
    actionsHtml = `<button class="btn btn-gold admin-btn" onclick="openBuzzers()">Open Buzzers</button>`;
  } else if (state.buzzerOpen && !buzzed) {
    actionsHtml = `
      <div class="admin-status">Buzzers open — waiting...</div>
      <button class="btn btn-outline admin-btn" onclick="noAnswer()">No Answer — Skip</button>
    `;
  } else if (buzzed) {
    const buzzerName = state.players?.[buzzed]?.name || '?';
    actionsHtml = `
      <div class="admin-status">${buzzerName} buzzed in</div>
      <button class="btn btn-gold admin-btn" onclick="judgeCorrect()">✓ Correct</button>
      <button class="btn btn-danger admin-btn" onclick="judgeWrong()">✗ Wrong</button>
    `;
  }

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-label">Answer</div>
      <div class="admin-answer">${question.a}</div>
    </div>
    <div class="admin-section">
      <div class="admin-label">Worth $${value}</div>
    </div>
    <div class="admin-actions">${actionsHtml}</div>
  `;
}

function renderAdminDailyDouble() {
  const panel = document.getElementById('admin-panel');
  if (!panel || !state.currentTile || !state.board) return;

  const { catIndex, qIndex, row } = state.currentTile;
  const boardData = BOARDS[state.board.boardKey];
  const question  = boardData.categories[catIndex].questions[qIndex];
  const value     = state.board.pointValues[row];
  const active    = state.players?.[state.activePlayer];
  const wager     = state.ddWager;

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-label">Daily Double</div>
      <div class="admin-answer" style="font-size:13px;">${question.q}</div>
      <div class="admin-label" style="margin-top:6px;">Answer: ${question.a}</div>
    </div>
    ${wager ? `
      <div class="admin-section">
        <div class="admin-label">Wager: $${wager}</div>
      </div>
      <div class="admin-actions">
        <button class="btn btn-gold admin-btn" onclick="judgeCorrect()">✓ Correct +$${wager}</button>
        <button class="btn btn-danger admin-btn" onclick="judgeWrong()">✗ Wrong −$${wager}</button>
      </div>
    ` : `
      <div class="admin-section">
        <div class="admin-label">Waiting for ${active?.name || '...'} to wager</div>
      </div>
    `}
  `;
}

function openBuzzers() {
  if (!isHost) return;
  roomRef.update({ buzzerOpen: true });
}

function noAnswer() {
  if (!isHost) return;

  const updates = {
    phase:        'board-select',
    currentTile:  null,
    buzzedPlayer: null,
    buzzerOpen:   false,
    ddWager:      null
  };
  markTileUsed(updates);
  roomRef.update(updates);
}

function judgeCorrect() {
  if (!isHost || !state.currentTile) return;

  const { catIndex, qIndex, row } = state.currentTile;
  const value   = state.board.pointValues[row];
  const awardTo = state.ddWager ? state.activePlayer : (state.buzzedPlayer || state.activePlayer);
  const amount  = state.ddWager || value;
  const current = state.players?.[awardTo]?.score || 0;

  const updates = {
    [`players/${awardTo}/score`]: current + amount,
    phase:        'board-select',
    activePlayer: awardTo,
    buzzedPlayer: null,
    buzzerOpen:   false,
    currentTile:  null,
    ddWager:      null
  };

  markTileUsed(updates);

  const totalTiles = state.board.categories.length * state.board.pointValues.length;
  let usedCount    = 0;
  Object.values(state.usedTiles || {}).forEach(cat => {
    usedCount += Object.keys(cat).length;
  });
  if (usedCount + 1 >= totalTiles) updates.phase = 'game-over';

  roomRef.update(updates);
}

function judgeWrong() {
  if (!isHost || !state.currentTile) return;

  const { row }  = state.currentTile;
  const value    = state.board.pointValues[row];
  const deductFrom = state.ddWager ? state.activePlayer : state.buzzedPlayer;
  const amount   = state.ddWager || value;
  const updates  = {};

  if (deductFrom) {
    const current = state.players?.[deductFrom]?.score || 0;
    updates[`players/${deductFrom}/score`] = current - amount;
  }

  if (state.ddWager) {
    Object.assign(updates, {
      phase:        'board-select',
      buzzedPlayer: null,
      buzzerOpen:   false,
      currentTile:  null,
      ddWager:      null
    });
    markTileUsed(updates);

    const totalTiles = state.board.categories.length * state.board.pointValues.length;
    let usedCount    = 0;
    Object.values(state.usedTiles || {}).forEach(cat => {
      usedCount += Object.keys(cat).length;
    });
    if (usedCount + 1 >= totalTiles) updates.phase = 'game-over';
  } else {
    Object.assign(updates, {
      phase:        'question-reveal',
      buzzedPlayer: null,
      buzzerOpen:   false
    });
  }

  roomRef.update(updates);
}

function markTileUsed(updates) {
  const { catIndex, qIndex } = state.currentTile;
  updates[`usedTiles/${catIndex}/${qIndex}`] = true;
}

function renderGameOver() {
  const scores = document.getElementById('gameover-scores');
  if (!scores || !state.players) return;

  const sorted = Object.entries(state.players)
    .filter(([, p]) => !p.host)
    .sort((a, b) => b[1].score - a[1].score);

  scores.innerHTML = sorted.map(([, p], i) => `
    <div class="gameover-entry ${i === 0 ? 'winner' : ''}">
      <span class="go-rank">${i + 1}</span>
      <span class="go-name">${p.name}</span>
      <span class="go-score">$${(p.score || 0).toLocaleString()}</span>
    </div>
  `).join('');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function leaveGame() {
  roomRef.child('players').child(myId).remove();
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', initGame);
