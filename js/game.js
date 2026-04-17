// game.js — In-game logic
// Identity comes from sessionStorage, never from URL params

console.log('[game.js] Script loaded');

// ─── Identity (read from sessionStorage, set by lobby.js) ────────────────────
const roomCode = sessionStorage.getItem('jeo_room');
const myId     = sessionStorage.getItem('jeo_pid');
const myName   = sessionStorage.getItem('jeo_name') || 'Player';
const isHost   = sessionStorage.getItem('jeo_host') === '1';

console.log('[game.js] Identity — roomCode:', roomCode, '| myId:', myId, '| myName:', myName, '| isHost:', isHost);

if (!roomCode || !myId) {
  console.error('[game.js] Missing session identity — redirecting to index');
  window.location.href = 'index.html';
}

const roomRef = db.ref('jeopardy_rooms/' + roomCode);
let state = {};
let cachedQuestions = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

function initGame() {
  document.getElementById('gameRoomCode').textContent = roomCode;
  document.getElementById('myNameDisplay').textContent = myName;

  if (isHost) {
    document.getElementById('admin-panel').style.display = 'flex';
  }

  roomRef.on('value', function(snap) {
    if (!snap.exists()) {
      window.location.href = 'index.html';
      return;
    }
    const prev = state.phase;
    state = snap.val();

    if (state.questions && !cachedQuestions) {
      cachedQuestions = state.questions;
    }

    if (prev !== state.phase) {
      console.log('[game] Phase:', prev, '→', state.phase);
    }
    render();
  });

  if (isHost) {
    roomRef.child('players').on('value', function(snap) {
      const players = snap.val() || {};
      if (Object.values(players).filter(function(p) { return !p.host; }).length === 0) {
        roomRef.remove();
      }
    });
    window.addEventListener('beforeunload', function() {
      navigator.sendBeacon(
        'https://jeopardy-bc3e9-default-rtdb.europe-west1.firebasedatabase.app/jeopardy_rooms/' + roomCode + '.json',
        JSON.stringify(null)
      );
    });
  } else {
    window.addEventListener('beforeunload', function() {
      roomRef.child('players').child(myId).remove();
    });
  }
}

// ─── Render dispatch ──────────────────────────────────────────────────────────

function render() {
  if (!state.board) return;

  renderScoreboard();
  renderTurnBanner();

  const phase = state.phase;

  if (phase === 'board-select') {
    showPanel('panel-board');
    renderBoard();
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

  } else if (phase === 'answer-correct') {
    showPanel('panel-question');
    renderAnswerReveal(true);

  } else if (phase === 'answer-incorrect') {
    showPanel('panel-question');
    renderAnswerReveal(false);

  } else if (phase === 'board-complete') {
    showPanel('panel-board-complete');
    renderBoardComplete();

  } else if (phase === 'game-over') {
    showPanel('panel-gameover');
    renderGameOver();
  }
}

function showPanel(id) {
  document.querySelectorAll('.game-panel').forEach(function(p) { p.classList.remove('active'); });
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  else console.error('[showPanel] Panel not found:', id);
}

// ─── Scoreboard & turn banner ─────────────────────────────────────────────────

function renderTurnBanner() {
  const banner = document.getElementById('turn-banner');
  if (!banner || !state.players || !state.activePlayer) return;
  const active = state.players[state.activePlayer];
  if (!active) return;
  const isMe = state.activePlayer === myId;
  banner.textContent = isMe ? 'Your turn — pick a question' : (active.name + '\'s turn');
  banner.className = 'turn-banner' + (isMe ? ' my-turn' : '');
}

function renderScoreboard() {
  const board = document.getElementById('scoreboard');
  if (!board || !state.players) return;
  const sorted = Object.entries(state.players)
    .filter(function(e) { return !e[1].host; })
    .sort(function(a, b) { return b[1].score - a[1].score; });

  board.innerHTML = sorted.map(function(e) {
    const pid = e[0], p = e[1];
    return '<div class="score-entry ' + (pid===myId?'me':'') + ' ' + (pid===state.activePlayer?'active-turn':'') + '">' +
      '<span class="score-name">' + p.name + '</span>' +
      '<span class="score-val">$' + (p.score||0).toLocaleString() + '</span>' +
    '</div>';
  }).join('');

  if (isHost) {
    board.innerHTML += '<div class="score-entry host-entry"><span class="score-name score-name-host">Host <span class="host-star">★</span></span></div>';
  }
}

// ─── Question helpers ─────────────────────────────────────────────────────────

function getQuestion(catIndex, qIndex) {
  const questions = cachedQuestions || state.questions;
  if (!questions) return null;
  const catQ = questions[catIndex] !== undefined ? questions[catIndex] : questions[String(catIndex)];
  if (!catQ) return null;
  const q = Array.isArray(catQ) ? catQ[qIndex] : (catQ[qIndex] !== undefined ? catQ[qIndex] : catQ[String(qIndex)]);
  return q || null;
}

// ─── Is a tile a daily double? ────────────────────────────────────────────────

function isDailyDouble(ci, qi) {
  if (!state.board || !state.board.dailyDoubles) return false;
  return state.board.dailyDoubles.some(function(dd) {
    return dd.catIndex === ci && dd.qIndex === qi;
  });
}

// ─── Board ────────────────────────────────────────────────────────────────────

function renderBoard() {
  const area = document.getElementById('board-grid');
  if (!area || !state.board) return;

  const categories = state.board.categories;
  const values = state.board.pointValues;

  const canSelect = state.activePlayer === myId && !isHost;
  const hostCanSelect = isHost;

  let html = '<div class="jeopardy-board">';

  categories.forEach(function(cat, ci) {
    html += '<div class="board-col"><div class="board-cell cat-header">' + cat.name + '</div>';

    values.forEach(function(val, row) {
      const qi = cat.questionOrder[row];
      const used = state.usedTiles && state.usedTiles[ci] && state.usedTiles[ci][qi];
      const isDD = isHost && isDailyDouble(ci, qi);
      const clickable = !used && (canSelect || hostCanSelect);

      html += '<div class="board-cell val-cell ' + (used ? 'used' : '') + ' ' + (isDD ? 'daily-double-marker' : '') + '"' +
        (clickable ? ' onclick="selectTile(' + ci + ',' + qi + ',' + row + ')"' : '') + '>' +
        (used ? '' : (isDD ? '<span class="dd-star">★</span>$' + val : '$' + val)) +
      '</div>';
    });

    html += '</div>';
  });

  html += '</div>';
  area.innerHTML = html;
}

function selectTile(catIndex, qIndex, row) {
  if (state.phase !== 'board-select') return;
  if (state.activePlayer !== myId && !isHost) return;

  const isDD = isDailyDouble(catIndex, qIndex);

  roomRef.update({
    currentTile: { catIndex: catIndex, qIndex: qIndex, row: row },
    phase: isDD ? 'daily-double' : 'question-reveal',
    buzzedPlayer: null,
    failedPlayers: null,
    buzzerOpen: false,
    ddWager: null
  });
}

// ─── Question panel ───────────────────────────────────────────────────────────

function renderQuestionPanel() {
  if (!state.currentTile || !state.board) return;
  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex, row = state.currentTile.row;
  const question = getQuestion(ci, qi);
  const value = state.board.pointValues[row];
  const category = state.board.categories[ci];

  document.getElementById('q-category').textContent = category ? category.name : '?';
  document.getElementById('q-value').textContent = '$' + value;
  document.getElementById('q-text').textContent = question ? question.q : '(question not found)';

  const buzzerEl  = document.getElementById('player-buzzer');
  const statusEl  = document.getElementById('buzzer-status');
  const judgingEl = document.getElementById('judging-info');
  const revealEl  = document.getElementById('answer-reveal');

  if (revealEl) revealEl.style.display = 'none';
  const card = document.querySelector('.question-card');
  if (card) card.classList.remove('rim-correct', 'rim-incorrect');

  const buzzed    = state.buzzedPlayer;
  const isJudging = state.phase === 'judging';
  const failed    = state.failedPlayers || {};

  if (isJudging && buzzed && state.players && state.players[buzzed]) {
    if (buzzerEl) buzzerEl.style.display = 'none';
    if (statusEl) statusEl.style.display = 'none';
    if (judgingEl) { judgingEl.style.display = 'block'; judgingEl.textContent = state.players[buzzed].name + ' is answering...'; }
  } else {
    if (judgingEl) judgingEl.style.display = 'none';

    if (!isHost && buzzerEl) {
      const alreadyFailed = failed[myId];
      const canBuzz = state.buzzerOpen && !buzzed && !alreadyFailed;
      const isBuzzed = buzzed === myId;
      buzzerEl.style.display = 'block';
      buzzerEl.disabled = !canBuzz || !!buzzed;
      buzzerEl.textContent = isBuzzed ? 'You buzzed in!' : alreadyFailed ? 'Already tried' : canBuzz ? 'BUZZ IN' : 'Wait...';
      buzzerEl.className = 'buzzer-btn' + (isBuzzed ? ' buzzed' : canBuzz ? ' ready' : alreadyFailed ? ' failed' : '');
    } else if (isHost && buzzerEl) {
      buzzerEl.style.display = 'none';
    }

    if (statusEl) {
      statusEl.style.display = 'block';
      if (buzzed && state.players && state.players[buzzed]) {
        statusEl.textContent = state.players[buzzed].name + ' buzzed in!';
        statusEl.className = 'buzzer-status active';
      } else if (state.buzzerOpen) {
        statusEl.textContent = 'Buzzers are open!';
        statusEl.className = 'buzzer-status open';
      } else {
        statusEl.textContent = 'Waiting for host...';
        statusEl.className = 'buzzer-status';
      }
    }
  }
}

function renderAnswerReveal(correct) {
  if (!state.currentTile || !state.board) return;
  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex, row = state.currentTile.row;
  const question = getQuestion(ci, qi);
  const category = state.board.categories[ci];

  document.getElementById('q-category').textContent = category ? category.name : '?';
  document.getElementById('q-value').textContent = '$' + state.board.pointValues[row];
  document.getElementById('q-text').textContent = question ? question.q : '';

  const buzzerEl  = document.getElementById('player-buzzer');
  const statusEl  = document.getElementById('buzzer-status');
  const judgingEl = document.getElementById('judging-info');
  const revealEl  = document.getElementById('answer-reveal');

  if (buzzerEl)  buzzerEl.style.display  = 'none';
  if (statusEl)  statusEl.style.display  = 'none';
  if (judgingEl) judgingEl.style.display = 'none';

  if (revealEl) {
    revealEl.style.display = 'block';
    revealEl.textContent = 'Answer: ' + (question ? question.a : '(not found)');
  }

  const card = document.querySelector('.question-card');
  if (card) {
    card.classList.remove('rim-correct', 'rim-incorrect');
    card.classList.add(correct ? 'rim-correct' : 'rim-incorrect');
  }

  if (isHost) renderAdminAnswerReveal();
}

function playerBuzz() {
  if (isHost || !state.buzzerOpen || state.buzzedPlayer) return;
  if ((state.failedPlayers || {})[myId]) return;
  roomRef.update({ buzzedPlayer: myId, phase: 'judging' });
}

// ─── Daily Double ─────────────────────────────────────────────────────────────

function renderDailyDoublePanel() {
  if (!state.currentTile || !state.board) return;
  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex;
  const question = getQuestion(ci, qi);
  const isActive = state.activePlayer === myId && !isHost;
  const wager = state.ddWager;

  document.getElementById('dd-category').textContent = (state.board.categories[ci] || {}).name || '?';

  const waitingMsg   = document.getElementById('dd-waiting-msg');
  const wagerArea    = document.getElementById('dd-wager-area');
  const questionArea = document.getElementById('dd-question-area');

  if (wager) {
    if (waitingMsg)   waitingMsg.style.display   = 'none';
    if (wagerArea)    wagerArea.style.display     = 'none';
    if (questionArea) {
      questionArea.style.display = 'block';
      document.getElementById('dd-question-text').textContent = question ? question.q : '(not found)';
    }
  } else if (isActive) {
    if (waitingMsg)   waitingMsg.style.display   = 'none';
    if (questionArea) questionArea.style.display = 'none';
    if (wagerArea) {
      wagerArea.style.display = 'block';
      // Update the wager input min/max dynamically
      const score = (state.players && state.players[myId] && state.players[myId].score) || 0;
      const minWager = 5;
      const maxWager = Math.max(1000, score);
      const input = document.getElementById('dd-wager-input');
      if (input) {
        input.min = minWager;
        input.max = maxWager;
        input.placeholder = '$5 – $' + maxWager.toLocaleString();
      }
      const hint = document.getElementById('dd-wager-hint');
      if (hint) hint.textContent = 'Wager between $' + minWager + ' and $' + maxWager.toLocaleString();
    }
  } else {
    if (wagerArea)    wagerArea.style.display    = 'none';
    if (questionArea) questionArea.style.display = 'none';
    if (waitingMsg)   waitingMsg.style.display   = 'block';
  }
}

function submitWager() {
  if (state.activePlayer !== myId || isHost) return;
  const input = document.getElementById('dd-wager-input');
  const val = parseInt((input && input.value) || '0', 10);
  const score = (state.players && state.players[myId] && state.players[myId].score) || 0;
  const minWager = 5;
  const maxWager = Math.max(1000, score);

  if (isNaN(val) || val < minWager || val > maxWager) {
    showToast('BET BETWEEN $' + minWager + ' AND $' + maxWager.toLocaleString());
    return;
  }
  roomRef.update({ ddWager: val });
}

// ─── Board complete screen ────────────────────────────────────────────────────

function renderBoardComplete() {
  const el = document.getElementById('board-complete-label');
  if (el && state.board) {
    el.textContent = 'Board ' + state.board.boardKey + ' Complete!';
  }
  // Only host sees the "Next" button
  const nextBtn = document.getElementById('board-complete-next-btn');
  if (nextBtn) nextBtn.style.display = isHost ? 'inline-block' : 'none';
}

function hostAdvanceFromBoardComplete() {
  if (!isHost) return;
  // Board B finishing = game over (placeholder for future feature)
  if (state.board && state.board.boardKey === 'B') {
    roomRef.update({ phase: 'game-over' });
    return;
  }
  // Board A finishing: for now advance to game-over too (extend later with Board B start)
  roomRef.update({ phase: 'game-over' });
}

// ─── Admin panels ─────────────────────────────────────────────────────────────

function renderAdminBoardSelect() {
  const panel = document.getElementById('admin-panel');
  if (!panel) return;
  panel.innerHTML =
    '<div class="admin-section">' +
      '<div class="admin-label">Active Board: ' + state.board.boardKey + '</div>' +
      '<div class="admin-label" style="margin-top:6px;opacity:.7;">★ = Daily Double (only you see this)</div>' +
    '</div>' +
    '<div class="admin-actions"><button class="btn btn-danger admin-btn" onclick="confirmCloseRoom()">Close Room</button></div>';
}

function renderAdminQuestion() {
  const panel = document.getElementById('admin-panel');
  if (!panel || !state.currentTile || !state.board) return;

  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex, row = state.currentTile.row;
  const question = getQuestion(ci, qi);
  const value = state.board.pointValues[row];
  const buzzed = state.buzzedPlayer;
  const failed = state.failedPlayers || {};
  const nonHostPlayers = Object.entries(state.players || {}).filter(function(e) { return !e[1].host; });
  const allFailed = nonHostPlayers.every(function(e) { return failed[e[0]]; });

  let actionsHtml = '';
  if (!state.buzzerOpen && !buzzed) {
    actionsHtml = '<button class="btn btn-gold admin-btn" onclick="openBuzzers()">Open Buzzers</button>';
  } else if (state.buzzerOpen && !buzzed) {
    actionsHtml = allFailed
      ? '<div class="admin-status">Everyone failed</div><button class="btn btn-outline admin-btn" onclick="noAnswer()">Reveal & Skip</button>'
      : '<div class="admin-status">Buzzers open — waiting...</div><button class="btn btn-outline admin-btn" onclick="noAnswer()">No Answer — Skip</button>';
  } else if (buzzed) {
    const bName = (state.players && state.players[buzzed] && state.players[buzzed].name) || '?';
    actionsHtml =
      '<div class="admin-status">' + bName + ' buzzed in</div>' +
      '<button class="btn btn-gold admin-btn" onclick="judgeCorrect()">✓ Correct</button>' +
      '<button class="btn btn-danger admin-btn" onclick="judgeWrong()">✗ Wrong</button>';
  }

  panel.innerHTML =
    '<div class="admin-section">' +
      '<div class="admin-label">Answer</div>' +
      '<div class="admin-answer">' + (question ? question.a : '(not found)') + '</div>' +
    '</div>' +
    '<div class="admin-section"><div class="admin-label">Worth $' + value + '</div></div>' +
    '<div class="admin-actions">' + actionsHtml + '</div>' +
    '<div class="admin-actions" style="margin-top:8px;"><button class="btn btn-danger admin-btn" onclick="confirmCloseRoom()">Close Room</button></div>';
}

function renderAdminAnswerReveal() {
  const panel = document.getElementById('admin-panel');
  if (!panel) return;
  panel.innerHTML =
    '<div class="admin-section"><div class="admin-label">Answer revealed to screen</div></div>' +
    '<div class="admin-actions"><button class="btn btn-gold admin-btn" onclick="moveOnFromReveal()">Move On</button></div>' +
    '<div class="admin-actions" style="margin-top:8px;"><button class="btn btn-danger admin-btn" onclick="confirmCloseRoom()">Close Room</button></div>';
}

function renderAdminDailyDouble() {
  const panel = document.getElementById('admin-panel');
  if (!panel || !state.currentTile || !state.board) return;

  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex, row = state.currentTile.row;
  const question = getQuestion(ci, qi);
  const value = state.board.pointValues[row];
  const active = state.players && state.players[state.activePlayer];
  const wager = state.ddWager;

  panel.innerHTML =
    '<div class="admin-section">' +
      '<div class="admin-label">Daily Double</div>' +
      '<div class="admin-answer" style="font-size:13px;">' + (question ? question.q : '(not found)') + '</div>' +
      '<div class="admin-label" style="margin-top:6px;">Answer: ' + (question ? question.a : '(not found)') + '</div>' +
    '</div>' +
    (wager
      ? '<div class="admin-section"><div class="admin-label">Wager: $' + wager + '</div></div>' +
        '<div class="admin-actions">' +
          '<button class="btn btn-gold admin-btn" onclick="judgeCorrect()">✓ Correct +$' + wager + '</button>' +
          '<button class="btn btn-danger admin-btn" onclick="judgeWrong()">✗ Wrong −$' + wager + '</button>' +
        '</div>'
      : '<div class="admin-section"><div class="admin-label">Waiting for ' + ((active && active.name) || '...') + ' to wager</div></div>'
    ) +
    '<div class="admin-actions" style="margin-top:8px;"><button class="btn btn-danger admin-btn" onclick="confirmCloseRoom()">Close Room</button></div>';
}

// ─── Host actions ─────────────────────────────────────────────────────────────

function openBuzzers() {
  if (!isHost) return;
  roomRef.update({ buzzerOpen: true });
}

function noAnswer() {
  if (!isHost) return;
  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex, row = state.currentTile.row;
  const question = getQuestion(ci, qi);
  const updates = {
    phase: 'answer-incorrect',
    buzzedPlayer: null,
    buzzerOpen: false,
    ddWager: null,
    revealAnswer: question ? question.a : '',
    revealValue: state.board.pointValues[row],
    revealReturnToPlayer: state.activePlayer,
    skipToBoard: true
  };
  markTileUsed(updates);
  checkBoardComplete(updates);
  roomRef.update(updates);
}

function moveOnFromReveal() {
  if (!isHost) return;
  const updates = {
    phase: 'board-select',
    currentTile: null,
    buzzedPlayer: null,
    failedPlayers: null,
    buzzerOpen: false,
    ddWager: null,
    revealAnswer: null,
    revealValue: null,
    revealReturnToPlayer: null,
    skipToBoard: null
  };

  if (state.phase === 'answer-correct') {
    updates.activePlayer = state.buzzedPlayer || state.activePlayer;
  } else {
    updates.activePlayer = state.revealReturnToPlayer || state.activePlayer;
  }

  roomRef.update(updates);
}

function judgeCorrect() {
  if (!isHost || !state.currentTile) return;

  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex, row = state.currentTile.row;
  const question = getQuestion(ci, qi);
  const value = state.board.pointValues[row];
  // For daily double: award ddWager to activePlayer. For normal: award value to buzzedPlayer.
  const awardTo = state.ddWager != null ? state.activePlayer : (state.buzzedPlayer || state.activePlayer);
  const amount  = state.ddWager != null ? state.ddWager : value;
  const current = (state.players && state.players[awardTo] && state.players[awardTo].score) || 0;

  const updates = {};
  updates['players/' + awardTo + '/score'] = current + amount;
  updates.phase                = 'answer-correct';
  updates.buzzedPlayer         = state.buzzedPlayer || null;
  updates.buzzerOpen           = false;
  updates.revealAnswer         = question ? question.a : '';
  updates.revealValue          = value;
  updates.revealReturnToPlayer = awardTo;
  updates.skipToBoard          = false;

  markTileUsed(updates);
  checkBoardComplete(updates);
  roomRef.update(updates);
}

function judgeWrong() {
  if (!isHost || !state.currentTile) return;

  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex, row = state.currentTile.row;
  const question = getQuestion(ci, qi);
  const value = state.board.pointValues[row];
  const isDD = state.ddWager != null;
  const deductFrom = isDD ? state.activePlayer : state.buzzedPlayer;
  const amount = isDD ? state.ddWager : value;
  const updates = {};

  if (deductFrom) {
    const current = (state.players && state.players[deductFrom] && state.players[deductFrom].score) || 0;
    updates['players/' + deductFrom + '/score'] = current - amount;
  }

  if (isDD) {
    updates.phase                = 'answer-incorrect';
    updates.buzzedPlayer         = null;
    updates.buzzerOpen           = false;
    updates.revealAnswer         = question ? question.a : '';
    updates.revealValue          = value;
    updates.revealReturnToPlayer = state.activePlayer;
    updates.skipToBoard          = true;
    markTileUsed(updates);
    checkBoardComplete(updates);
  } else {
    const failed = Object.assign({}, state.failedPlayers || {});
    failed[deductFrom] = true;
    const nonHostPlayers = Object.entries(state.players || {}).filter(function(e) { return !e[1].host; });
    const allFailed = nonHostPlayers.every(function(e) { return failed[e[0]]; });

    if (allFailed) {
      updates.phase                = 'answer-incorrect';
      updates.buzzedPlayer         = null;
      updates.failedPlayers        = failed;
      updates.buzzerOpen           = false;
      updates.revealAnswer         = question ? question.a : '';
      updates.revealValue          = value;
      updates.revealReturnToPlayer = state.activePlayer;
      updates.skipToBoard          = true;
      markTileUsed(updates);
      checkBoardComplete(updates);
    } else {
      updates.phase        = 'question-reveal';
      updates.buzzedPlayer = null;
      updates.failedPlayers = failed;
      updates.buzzerOpen   = true;
    }
  }

  roomRef.update(updates);
}

function markTileUsed(updates) {
  const ci = state.currentTile.catIndex, qi = state.currentTile.qIndex;
  updates['usedTiles/' + ci + '/' + qi] = true;
}

// Check if all tiles will be used after this move; if so, set phase to board-complete instead of answer-*
function checkBoardComplete(updates) {
  const totalTiles = state.board.categories.length * state.board.pointValues.length;
  let usedCount = 0;
  Object.values(state.usedTiles || {}).forEach(function(cat) {
    usedCount += Object.keys(cat).length;
  });
  // +1 for the tile we're about to mark used
  if (usedCount + 1 >= totalTiles) {
    updates.phase = 'board-complete';
  }
}

function confirmCloseRoom() {
  if (!window.confirm('Are you sure you want to close the room?')) return;
  roomRef.remove();
  window.location.href = 'index.html';
}

// ─── Game over ────────────────────────────────────────────────────────────────

function renderGameOver() {
  const scores = document.getElementById('gameover-scores');
  if (!scores || !state.players) return;
  const sorted = Object.entries(state.players)
    .filter(function(e) { return !e[1].host; })
    .sort(function(a, b) { return b[1].score - a[1].score; });

  scores.innerHTML = sorted.map(function(e, i) {
    const p = e[1];
    return '<div class="gameover-entry ' + (i===0?'winner':'') + '">' +
      '<span class="go-rank">' + (i+1) + '</span>' +
      '<span class="go-name">' + p.name + '</span>' +
      '<span class="go-score">$' + (p.score||0).toLocaleString() + '</span>' +
    '</div>';
  }).join('');
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 3000);
}

function leaveGame() {
  if (!isHost) roomRef.child('players').child(myId).remove();
  sessionStorage.removeItem('jeo_room');
  sessionStorage.removeItem('jeo_host');
  window.location.href = 'index.html';
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  initGame();
});

console.log('[game.js] Ready');
