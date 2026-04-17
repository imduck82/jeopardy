// game.js — In-game logic
// Depends on: firebase.js (db), boards.js (ALL_CATEGORIES)

console.log('[game.js] Script loaded');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');
const myId = params.get('pid');
const myName = decodeURIComponent(params.get('name') || 'Player');
const isHost = params.get('host') === '1';

console.log('[game.js] URL params — roomCode:', roomCode, '| myId:', myId, '| myName:', myName, '| isHost:', isHost);

if (!roomCode) {
  console.error('[game.js] No roomCode in URL — redirecting to index');
  window.location.href = 'index.html';
}

const roomRef = db.ref(`jeopardy_rooms/${roomCode}`);
let state = {};
let cachedQuestions = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

function initGame() {
  console.log('[initGame] Initialising game for room:', roomCode);
  document.getElementById('gameRoomCode').textContent = roomCode;
  document.getElementById('myNameDisplay').textContent = myName;

  roomRef.on('value', snap => {
    if (!snap.exists()) {
      console.warn('[initGame] Room no longer exists — redirecting to index');
      window.location.href = 'index.html';
      return;
    }
    const prev = state.phase;
    state = snap.val();
    console.log('[initGame] State update received. phase:', state.phase,
      '| activePlayer:', state.activePlayer,
      '| buzzerOpen:', state.buzzerOpen,
      '| buzzedPlayer:', state.buzzedPlayer);

    if (state.questions && !cachedQuestions) {
      cachedQuestions = state.questions;
      console.log('[initGame] Questions cached from Firebase. Category count:',
        Array.isArray(cachedQuestions) ? cachedQuestions.length : Object.keys(cachedQuestions).length);
    }

    if (prev !== state.phase) {
      console.log('[initGame] Phase changed:', prev, '→', state.phase);
    }

    render();
  });

  if (isHost) {
    roomRef.child('players').on('value', snap => {
      const players = snap.val() || {};
      const nonHostCount = Object.values(players).filter(p => !p.host).length;
      console.log('[initGame] Host player watch — non-host count:', nonHostCount);
      if (nonHostCount === 0) {
        console.log('[initGame] No players remain — removing room');
        roomRef.remove();
      }
    });

    window.addEventListener('beforeunload', () => {
      console.log('[beforeunload] Host leaving — deleting room via beacon');
      navigator.sendBeacon(
        `https://jeopardy-bc3e9-default-rtdb.europe-west1.firebasedatabase.app/jeopardy_rooms/${roomCode}.json`,
        JSON.stringify(null)
      );
    });
  } else {
    window.addEventListener('beforeunload', () => {
      console.log('[beforeunload] Player leaving — removing self from room');
      roomRef.child('players').child(myId).remove();
    });
  }

  console.log('[initGame] Firebase listeners attached');
}

// ─── Render dispatch ──────────────────────────────────────────────────────────

function render() {
  if (!state.board) { console.log('[render] No board yet — skipping'); return; }

  renderScoreboard();
  renderTurnBanner();

  const phase = state.phase;
  console.log('[render] Rendering phase:', phase);

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

  } else if (phase === 'game-over') {
    showPanel('panel-gameover');
    renderGameOver();

  } else {
    console.warn('[render] Unknown phase:', phase);
  }
}

function showPanel(id) {
  console.log('[showPanel] Activating panel:', id);
  document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
  } else {
    console.error('[showPanel] Panel not found:', id);
  }
}

// ─── Turn banner & scoreboard ─────────────────────────────────────────────────

function renderTurnBanner() {
  const banner = document.getElementById('turn-banner');
  if (!banner || !state.players || !state.activePlayer) return;

  const active = state.players[state.activePlayer];
  if (!active) { console.warn('[renderTurnBanner] activePlayer not in players:', state.activePlayer); return; }

  const isMe = state.activePlayer === myId;
  banner.textContent = isMe ? 'Your turn — pick a question' : `${active.name}'s turn`;
  banner.className = 'turn-banner' + (isMe ? ' my-turn' : '');
}

function renderScoreboard() {
  const board = document.getElementById('scoreboard');
  if (!board || !state.players) return;

  const sorted = Object.entries(state.players)
    .filter(([, p]) => !p.host)
    .sort((a, b) => b[1].score - a[1].score);

  board.innerHTML = sorted.map(([pid, p]) => `
    <div class="score-entry
      ${pid === myId ? 'me' : ''}
      ${pid === state.activePlayer ? 'active-turn' : ''}">
      <span class="score-name">${p.name}</span>
      <span class="score-val">$${(p.score || 0).toLocaleString()}</span>
    </div>
  `).join('');

  if (isHost && state.players[myId]) {
    board.innerHTML += `
      <div class="score-entry host-entry">
        <span class="score-name score-name-host">Host <span class="host-star">★</span></span>
      </div>
    `;
  }
}

// ─── Question helpers ─────────────────────────────────────────────────────────

function getQuestion(catIndex, qIndex) {
  const questions = cachedQuestions || state.questions;
  if (!questions) {
    console.warn('[getQuestion] No questions available (cache empty + no state.questions)');
    return null;
  }

  // questions may be stored as an object with numeric string keys
  const catQuestions = questions[catIndex] !== undefined
    ? questions[catIndex]
    : questions[String(catIndex)];

  if (!catQuestions) {
    console.warn('[getQuestion] No category at index', catIndex,
      '| available keys:', Object.keys(questions));
    return null;
  }

  // catQuestions may be an array or a numeric-keyed object
  const q = Array.isArray(catQuestions)
    ? catQuestions[qIndex]
    : catQuestions[qIndex] !== undefined ? catQuestions[qIndex] : catQuestions[String(qIndex)];

  if (!q) {
    console.warn('[getQuestion] No question at catIndex:', catIndex, 'qIndex:', qIndex);
  } else {
    console.log('[getQuestion] Retrieved catIndex:', catIndex, 'qIndex:', qIndex, '| q:', q.q);
  }

  return q || null;
}

// ─── Board ────────────────────────────────────────────────────────────────────

function renderBoard() {
  const area = document.getElementById('board-grid');
  if (!area || !state.board) { console.warn('[renderBoard] Missing area or board'); return; }

  const { board } = state;
  const categories = board.categories;
  const values = board.pointValues;
  const dd = board.dailyDouble;

  const canSelect = state.activePlayer === myId && !isHost;
  const hostCanSelect = isHost;
  console.log('[renderBoard] canSelect:', canSelect, '| hostCanSelect:', hostCanSelect,
    '| categories:', categories.length, '| values:', values);

  let html = '<div class="jeopardy-board">';

  categories.forEach((cat, ci) => {
    html += `<div class="board-col">
      <div class="board-cell cat-header">${cat.name}</div>`;

    values.forEach((val, row) => {
      const qi = cat.questionOrder[row];
      const used = state.usedTiles?.[ci]?.[qi];
      const isDD = isHost && dd.catIndex === ci && dd.qIndex === qi;
      const clickable = !used && (canSelect || hostCanSelect);

      html += `<div class="board-cell val-cell ${used ? 'used' : ''} ${isDD ? 'daily-double-marker' : ''}"
        ${clickable ? `onclick="selectTile(${ci}, ${qi}, ${row})"` : ''}>
        ${used ? '' : isDD ? `<span class="dd-star">★</span>$${val}` : `$${val}`}
      </div>`;
    });

    html += '</div>';
  });

  html += '</div>';
  area.innerHTML = html;
}

function selectTile(catIndex, qIndex, row) {
  console.log('[selectTile] catIndex:', catIndex, '| qIndex:', qIndex, '| row:', row);
  if (state.phase !== 'board-select') { console.warn('[selectTile] Wrong phase:', state.phase); return; }
  if (state.activePlayer !== myId && !isHost) { console.warn('[selectTile] Not active player'); return; }

  const dd = state.board.dailyDouble;
  const isDD = dd.catIndex === catIndex && dd.qIndex === qIndex;
  console.log('[selectTile] isDD:', isDD);

  roomRef.update({
    currentTile: { catIndex, qIndex, row },
    phase: isDD ? 'daily-double' : 'question-reveal',
    buzzedPlayer: null,
    failedPlayers: null,
    buzzerOpen: false,
    ddWager: null
  }).then(() => {
    console.log('[selectTile] Tile selection written to Firebase');
  }).catch(err => {
    console.error('[selectTile] Firebase update failed:', err);
  });
}

// ─── Question panel ───────────────────────────────────────────────────────────

function renderQuestionPanel() {
  if (!state.currentTile || !state.board) { console.warn('[renderQuestionPanel] Missing currentTile or board'); return; }

  const { catIndex, qIndex, row } = state.currentTile;
  console.log('[renderQuestionPanel] catIndex:', catIndex, '| qIndex:', qIndex, '| row:', row);

  const question = getQuestion(catIndex, qIndex);
  const value = state.board.pointValues[row];
  const category = state.board.categories[catIndex];

  document.getElementById('q-category').textContent = category ? category.name : '?';
  document.getElementById('q-value').textContent = `$${value}`;
  document.getElementById('q-text').textContent = question ? question.q : '(question not found)';

  if (!question) {
    console.error('[renderQuestionPanel] Question is null for catIndex:', catIndex, 'qIndex:', qIndex);
  }

  const buzzerEl = document.getElementById('player-buzzer');
  const statusEl = document.getElementById('buzzer-status');
  const judgingEl = document.getElementById('judging-info');
  const answerRevealEl = document.getElementById('answer-reveal');

  const buzzed = state.buzzedPlayer;
  const isJudging = state.phase === 'judging';
  const failed = state.failedPlayers || {};

  if (answerRevealEl) answerRevealEl.style.display = 'none';

  const questionCard = document.querySelector('.question-card');
  if (questionCard) questionCard.classList.remove('rim-correct', 'rim-incorrect');

  if (isJudging && buzzed && state.players?.[buzzed]) {
    console.log('[renderQuestionPanel] Judging state — buzzed player:', state.players[buzzed].name);
    if (buzzerEl) buzzerEl.style.display = 'none';
    if (statusEl) statusEl.style.display = 'none';
    if (judgingEl) {
      judgingEl.style.display = 'block';
      judgingEl.textContent = `${state.players[buzzed].name} is answering...`;
    }
  } else {
    if (judgingEl) judgingEl.style.display = 'none';

    if (!isHost && buzzerEl) {
      const alreadyFailed = failed[myId];
      const canBuzz = state.buzzerOpen && !buzzed && !alreadyFailed;
      const isBuzzed = buzzed === myId;

      console.log('[renderQuestionPanel] Buzzer state — canBuzz:', canBuzz,
        '| alreadyFailed:', alreadyFailed, '| isBuzzed:', isBuzzed, '| buzzerOpen:', state.buzzerOpen);

      buzzerEl.style.display = 'block';
      buzzerEl.disabled = !canBuzz || !!buzzed;
      buzzerEl.textContent = isBuzzed ? 'You buzzed in!' : alreadyFailed ? 'Already tried' : canBuzz ? 'BUZZ IN' : 'Wait...';
      buzzerEl.className = 'buzzer-btn' + (isBuzzed ? ' buzzed' : canBuzz ? ' ready' : alreadyFailed ? ' failed' : '');
    } else if (isHost && buzzerEl) {
      buzzerEl.style.display = 'none';
    }

    if (statusEl) {
      if (buzzed && state.players?.[buzzed]) {
        statusEl.textContent = `${state.players[buzzed].name} buzzed in!`;
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
  console.log('[renderAnswerReveal] correct:', correct);
  if (!state.currentTile || !state.board) { console.warn('[renderAnswerReveal] Missing currentTile or board'); return; }

  const { catIndex, qIndex, row } = state.currentTile;
  const question = getQuestion(catIndex, qIndex);
  const value = state.board.pointValues[row];
  const category = state.board.categories[catIndex];

  document.getElementById('q-category').textContent = category ? category.name : '?';
  document.getElementById('q-value').textContent = `$${value}`;
  document.getElementById('q-text').textContent = question ? question.q : '';

  const buzzerEl = document.getElementById('player-buzzer');
  const statusEl = document.getElementById('buzzer-status');
  const judgingEl = document.getElementById('judging-info');
  const answerRevealEl = document.getElementById('answer-reveal');

  if (buzzerEl) buzzerEl.style.display = 'none';
  if (statusEl) statusEl.style.display = 'none';
  if (judgingEl) judgingEl.style.display = 'none';

  if (answerRevealEl) {
    answerRevealEl.style.display = 'block';
    answerRevealEl.textContent = `Answer: ${question ? question.a : '(not found)'}`;
    if (!question) console.error('[renderAnswerReveal] question is null');
  }

  const questionCard = document.querySelector('.question-card');
  if (questionCard) {
    questionCard.classList.remove('rim-correct', 'rim-incorrect');
    questionCard.classList.add(correct ? 'rim-correct' : 'rim-incorrect');
  }

  if (isHost) renderAdminAnswerReveal();
}

function playerBuzz() {
  console.log('[playerBuzz] Attempting buzz. isHost:', isHost,
    '| buzzerOpen:', state.buzzerOpen, '| buzzedPlayer:', state.buzzedPlayer);

  if (isHost) { console.warn('[playerBuzz] Host cannot buzz'); return; }
  if (!state.buzzerOpen) { console.warn('[playerBuzz] Buzzers not open'); return; }
  if (state.buzzedPlayer) { console.warn('[playerBuzz] Someone already buzzed'); return; }

  const failed = state.failedPlayers || {};
  if (failed[myId]) { console.warn('[playerBuzz] Player already failed'); return; }

  console.log('[playerBuzz] Sending buzz for player:', myId);
  roomRef.update({ buzzedPlayer: myId, phase: 'judging' })
    .then(() => console.log('[playerBuzz] Buzz registered'))
    .catch(err => console.error('[playerBuzz] Firebase error:', err));
}

// ─── Daily Double ─────────────────────────────────────────────────────────────

function renderDailyDoublePanel() {
  if (!state.currentTile || !state.board) { console.warn('[renderDailyDoublePanel] Missing currentTile or board'); return; }

  const { catIndex, qIndex } = state.currentTile;
  const question = getQuestion(catIndex, qIndex);
  const isActive = state.activePlayer === myId && !isHost;
  const wager = state.ddWager;

  console.log('[renderDailyDoublePanel] isActive:', isActive, '| wager:', wager, '| question:', question?.q);

  document.getElementById('dd-category').textContent = state.board.categories[catIndex]?.name || '?';

  const waitingMsg = document.getElementById('dd-waiting-msg');
  const wagerArea = document.getElementById('dd-wager-area');
  const questionArea = document.getElementById('dd-question-area');

  if (wager) {
    if (waitingMsg) waitingMsg.style.display = 'none';
    if (wagerArea) wagerArea.style.display = 'none';
    if (questionArea) {
      questionArea.style.display = 'block';
      document.getElementById('dd-question-text').textContent = question ? question.q : '(not found)';
    }
  } else if (isActive) {
    if (waitingMsg) waitingMsg.style.display = 'none';
    if (questionArea) questionArea.style.display = 'none';
    if (wagerArea) wagerArea.style.display = 'block';
  } else {
    if (wagerArea) wagerArea.style.display = 'none';
    if (questionArea) questionArea.style.display = 'none';
    if (waitingMsg) waitingMsg.style.display = 'block';
  }
}

function submitWager() {
  console.log('[submitWager] Attempting wager submission. activePlayer:', state.activePlayer, '| myId:', myId);
  if (state.activePlayer !== myId || isHost) { console.warn('[submitWager] Not active player or is host'); return; }

  const input = document.getElementById('dd-wager-input');
  const val = parseInt(input?.value || '0', 10);
  const score = state.players?.[myId]?.score || 0;
  const maxBet = state.board.pointValues[state.board.pointValues.length - 1];
  const max = Math.max(score, maxBet);

  console.log('[submitWager] val:', val, '| score:', score, '| maxBet:', maxBet, '| max:', max);

  if (isNaN(val) || val < 1 || val > max) {
    showToast(`BET BETWEEN $1 AND $${max}`);
    return;
  }

  roomRef.update({ ddWager: val })
    .then(() => console.log('[submitWager] Wager written:', val))
    .catch(err => console.error('[submitWager] Firebase error:', err));
}

// ─── Admin panels ─────────────────────────────────────────────────────────────

function renderAdminBoardSelect() {
  const panel = document.getElementById('admin-panel');
  if (!panel) { console.warn('[renderAdminBoardSelect] admin-panel not found'); return; }

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-label">Active Board: ${state.board.boardKey}</div>
      <div class="admin-label" style="margin-top:6px; opacity:.7;">
        ★ = Daily Double (only you see this)
      </div>
    </div>
    <div class="admin-actions">
      <button class="btn btn-danger admin-btn" onclick="confirmCloseRoom()">Close Room</button>
    </div>
  `;
}

function renderAdminQuestion() {
  const panel = document.getElementById('admin-panel');
  if (!panel || !state.currentTile || !state.board) { console.warn('[renderAdminQuestion] Missing panel, currentTile or board'); return; }

  const { catIndex, qIndex, row } = state.currentTile;
  const question = getQuestion(catIndex, qIndex);
  const value = state.board.pointValues[row];
  const buzzed = state.buzzedPlayer;
  const failed = state.failedPlayers || {};

  const nonHostPlayers = Object.entries(state.players || {}).filter(([, p]) => !p.host);
  const allFailed = nonHostPlayers.every(([pid]) => failed[pid]);

  console.log('[renderAdminQuestion] buzzed:', buzzed, '| buzzerOpen:', state.buzzerOpen,
    '| allFailed:', allFailed, '| answer:', question?.a);

  let actionsHtml = '';

  if (!state.buzzerOpen && !buzzed) {
    actionsHtml = `<button class="btn btn-gold admin-btn" onclick="openBuzzers()">Open Buzzers</button>`;
  } else if (state.buzzerOpen && !buzzed) {
    if (allFailed) {
      actionsHtml = `
        <div class="admin-status">Everyone failed</div>
        <button class="btn btn-outline admin-btn" onclick="noAnswer()">Reveal & Skip</button>
      `;
    } else {
      actionsHtml = `
        <div class="admin-status">Buzzers open — waiting...</div>
        <button class="btn btn-outline admin-btn" onclick="noAnswer()">No Answer — Skip</button>
      `;
    }
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
      <div class="admin-answer">${question ? question.a : '(not found)'}</div>
    </div>
    <div class="admin-section">
      <div class="admin-label">Worth $${value}</div>
    </div>
    <div class="admin-actions">${actionsHtml}</div>
    <div class="admin-actions" style="margin-top:8px;">
      <button class="btn btn-danger admin-btn" onclick="confirmCloseRoom()">Close Room</button>
    </div>
  `;
}

function renderAdminAnswerReveal() {
  const panel = document.getElementById('admin-panel');
  if (!panel) { console.warn('[renderAdminAnswerReveal] admin-panel not found'); return; }

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-label">Answer revealed to screen</div>
    </div>
    <div class="admin-actions">
      <button class="btn btn-gold admin-btn" onclick="moveOnFromReveal()">Move On</button>
    </div>
    <div class="admin-actions" style="margin-top:8px;">
      <button class="btn btn-danger admin-btn" onclick="confirmCloseRoom()">Close Room</button>
    </div>
  `;
}

function renderAdminDailyDouble() {
  const panel = document.getElementById('admin-panel');
  if (!panel || !state.currentTile || !state.board) { console.warn('[renderAdminDailyDouble] Missing panel, currentTile or board'); return; }

  const { catIndex, qIndex, row } = state.currentTile;
  const question = getQuestion(catIndex, qIndex);
  const value = state.board.pointValues[row];
  const active = state.players?.[state.activePlayer];
  const wager = state.ddWager;

  console.log('[renderAdminDailyDouble] wager:', wager, '| active player:', active?.name, '| answer:', question?.a);

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-label">Daily Double</div>
      <div class="admin-answer" style="font-size:13px;">${question ? question.q : '(not found)'}</div>
      <div class="admin-label" style="margin-top:6px;">Answer: ${question ? question.a : '(not found)'}</div>
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
    <div class="admin-actions" style="margin-top:8px;">
      <button class="btn btn-danger admin-btn" onclick="confirmCloseRoom()">Close Room</button>
    </div>
  `;
}

// ─── Host actions ─────────────────────────────────────────────────────────────

function openBuzzers() {
  console.log('[openBuzzers] Opening buzzers');
  if (!isHost) { console.warn('[openBuzzers] Not host'); return; }
  roomRef.update({ buzzerOpen: true })
    .then(() => console.log('[openBuzzers] Buzzers opened'))
    .catch(err => console.error('[openBuzzers] Firebase error:', err));
}

function noAnswer() {
  console.log('[noAnswer] Host skipping question');
  if (!isHost) { console.warn('[noAnswer] Not host'); return; }

  const { catIndex, qIndex, row } = state.currentTile;
  const question = getQuestion(catIndex, qIndex);
  const value = state.board.pointValues[row];

  const updates = {
    phase: 'answer-incorrect',
    buzzedPlayer: null,
    buzzerOpen: false,
    ddWager: null,
    revealAnswer: question ? question.a : '',
    revealValue: value,
    revealReturnToPlayer: state.activePlayer,
    skipToBoard: true
  };
  markTileUsed(updates);

  console.log('[noAnswer] Writing updates:', updates);
  roomRef.update(updates)
    .then(() => console.log('[noAnswer] Update written'))
    .catch(err => console.error('[noAnswer] Firebase error:', err));
}

function moveOnFromReveal() {
  console.log('[moveOnFromReveal] Moving on. current phase:', state.phase);
  if (!isHost) { console.warn('[moveOnFromReveal] Not host'); return; }

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
    const awardTo = state.buzzedPlayer || state.activePlayer;
    updates.activePlayer = awardTo;
    console.log('[moveOnFromReveal] Correct — next active player:', awardTo);
  } else {
    updates.activePlayer = state.revealReturnToPlayer || state.activePlayer;
    console.log('[moveOnFromReveal] Incorrect/skip — returning to:', updates.activePlayer);
  }

  roomRef.update(updates)
    .then(() => console.log('[moveOnFromReveal] Update written'))
    .catch(err => console.error('[moveOnFromReveal] Firebase error:', err));
}

function judgeCorrect() {
  console.log('[judgeCorrect] Judging correct');
  if (!isHost || !state.currentTile) { console.warn('[judgeCorrect] Not host or no currentTile'); return; }

  const { catIndex, qIndex, row } = state.currentTile;
  const question = getQuestion(catIndex, qIndex);
  const value = state.board.pointValues[row];
  const awardTo = state.ddWager ? state.activePlayer : (state.buzzedPlayer || state.activePlayer);
  const amount = state.ddWager || value;
  const current = state.players?.[awardTo]?.score || 0;

  console.log('[judgeCorrect] awardTo:', awardTo, '| amount:', amount, '| current score:', current);

  const updates = {
    [`players/${awardTo}/score`]: current + amount,
    phase: 'answer-correct',
    buzzedPlayer: state.buzzedPlayer,
    buzzerOpen: false,
    revealAnswer: question ? question.a : '',
    revealValue: value,
    revealReturnToPlayer: awardTo,
    skipToBoard: false
  };

  markTileUsed(updates);

  const totalTiles = state.board.categories.length * state.board.pointValues.length;
  let usedCount = 0;
  Object.values(state.usedTiles || {}).forEach(cat => { usedCount += Object.keys(cat).length; });
  console.log('[judgeCorrect] Tiles used after this:', usedCount + 1, '/', totalTiles);
  if (usedCount + 1 >= totalTiles) {
    updates.phase = 'game-over';
    console.log('[judgeCorrect] All tiles used — triggering game-over');
  }

  roomRef.update(updates)
    .then(() => console.log('[judgeCorrect] Update written'))
    .catch(err => console.error('[judgeCorrect] Firebase error:', err));
}

function judgeWrong() {
  console.log('[judgeWrong] Judging wrong');
  if (!isHost || !state.currentTile) { console.warn('[judgeWrong] Not host or no currentTile'); return; }

  const { catIndex, qIndex, row } = state.currentTile;
  const question = getQuestion(catIndex, qIndex);
  const value = state.board.pointValues[row];
  const deductFrom = state.ddWager ? state.activePlayer : state.buzzedPlayer;
  const amount = state.ddWager || value;
  const updates = {};

  if (deductFrom) {
    const current = state.players?.[deductFrom]?.score || 0;
    console.log('[judgeWrong] Deducting', amount, 'from', deductFrom, '(current:', current, ')');
    updates[`players/${deductFrom}/score`] = current - amount;
  } else {
    console.log('[judgeWrong] No player to deduct from');
  }

  if (state.ddWager) {
    console.log('[judgeWrong] Daily Double wrong — tile used, returning to board');
    Object.assign(updates, {
      phase: 'answer-incorrect',
      buzzedPlayer: null,
      buzzerOpen: false,
      revealAnswer: question ? question.a : '',
      revealValue: value,
      revealReturnToPlayer: state.activePlayer,
      skipToBoard: true
    });
    markTileUsed(updates);

    const totalTiles = state.board.categories.length * state.board.pointValues.length;
    let usedCount = 0;
    Object.values(state.usedTiles || {}).forEach(cat => { usedCount += Object.keys(cat).length; });
    if (usedCount + 1 >= totalTiles) {
      updates.phase = 'game-over';
      console.log('[judgeWrong] All tiles used — game-over');
    }
  } else {
    const failed = state.failedPlayers || {};
    failed[deductFrom] = true;

    const nonHostPlayers = Object.entries(state.players || {}).filter(([, p]) => !p.host);
    const allFailed = nonHostPlayers.every(([pid]) => failed[pid]);
    console.log('[judgeWrong] allFailed:', allFailed, '| failed so far:', Object.keys(failed));

    if (allFailed) {
      Object.assign(updates, {
        phase: 'answer-incorrect',
        buzzedPlayer: null,
        failedPlayers: failed,
        buzzerOpen: false,
        revealAnswer: question ? question.a : '',
        revealValue: value,
        revealReturnToPlayer: state.activePlayer,
        skipToBoard: true
      });
      markTileUsed(updates);
    } else {
      Object.assign(updates, {
        phase: 'question-reveal',
        buzzedPlayer: null,
        failedPlayers: failed,
        buzzerOpen: true
      });
    }
  }

  roomRef.update(updates)
    .then(() => console.log('[judgeWrong] Update written'))
    .catch(err => console.error('[judgeWrong] Firebase error:', err));
}

function markTileUsed(updates) {
  const { catIndex, qIndex } = state.currentTile;
  console.log('[markTileUsed] Marking used — catIndex:', catIndex, 'qIndex:', qIndex);
  updates[`usedTiles/${catIndex}/${qIndex}`] = true;
}

function confirmCloseRoom() {
  console.log('[confirmCloseRoom] Host confirming close');
  const confirmed = window.confirm('Are you sure you want to close the room? All players will be kicked.');
  if (!confirmed) { console.log('[confirmCloseRoom] Cancelled'); return; }
  console.log('[confirmCloseRoom] Removing room and redirecting');
  roomRef.remove();
  window.location.href = 'index.html';
}

// ─── Game over ────────────────────────────────────────────────────────────────

function renderGameOver() {
  console.log('[renderGameOver] Rendering final scores');
  const scores = document.getElementById('gameover-scores');
  if (!scores || !state.players) { console.warn('[renderGameOver] Missing element or players'); return; }

  const sorted = Object.entries(state.players)
    .filter(([, p]) => !p.host)
    .sort((a, b) => b[1].score - a[1].score);

  console.log('[renderGameOver] Final standings:', sorted.map(([, p]) => `${p.name}: $${p.score}`));

  scores.innerHTML = sorted.map(([, p], i) => `
    <div class="gameover-entry ${i === 0 ? 'winner' : ''}">
      <span class="go-rank">${i + 1}</span>
      <span class="go-name">${p.name}</span>
      <span class="go-score">$${(p.score || 0).toLocaleString()}</span>
    </div>
  `).join('');
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg) {
  console.log('[showToast]', msg);
  const t = document.getElementById('toast');
  if (!t) { console.warn('[showToast] Toast element not found'); return; }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function leaveGame() {
  console.log('[leaveGame] Leaving game. isHost:', isHost);
  if (!isHost) roomRef.child('players').child(myId).remove();
  window.location.href = 'index.html';
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  console.log('[DOMContentLoaded] Calling initGame');
  initGame();
});

console.log('[game.js] Ready');
