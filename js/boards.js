// boards.js — Board definitions and Firebase question fetching

console.log('[boards.js] Script loaded');

const BOARD_POINT_VALUES = {
  A: [100, 200, 300, 400, 500],
  B: [200, 400, 600, 800, 1000]
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function initAuth() {
  const auth = firebase.auth();
  if (auth.currentUser) return;
  console.log('[initAuth] Signing in anonymously...');
  try {
    const cred = await auth.signInAnonymously();
    console.log('[initAuth] Signed in as', cred.user.uid);
  } catch (err) {
    console.error('[initAuth] Sign-in failed:', err);
    throw err;
  }
}

// ─── Fetch category names from Firebase ──────────────────────────────────────

async function fetchCategoryNames(boardKey) {
  console.log('[fetchCategoryNames] Fetching for board:', boardKey);
  await initAuth();
  let snapshot;
  try {
    snapshot = await db.ref('questions/' + boardKey).once('value');
  } catch (err) {
    console.error('[fetchCategoryNames] Firebase read error:', err);
    throw err;
  }
  if (!snapshot.exists()) throw new Error('No questions found for board ' + boardKey);
  const rawData = snapshot.val();
  const arr = Array.isArray(rawData) ? rawData : Object.values(rawData);
  const names = arr.filter(function(c) { return c && c.name; }).map(function(c) { return c.name; });
  console.log('[fetchCategoryNames] Found', names.length, 'categories:', names);
  return names;
}

// ─── Fetch questions for selected categories ──────────────────────────────────

async function fetchQuestions(boardKey, selectedCategoryNames) {
  console.log('[fetchQuestions] Fetching board:', boardKey, '| categories:', selectedCategoryNames);
  let snapshot;
  try {
    snapshot = await db.ref('questions/' + boardKey).once('value');
  } catch (err) {
    console.error('[fetchQuestions] Firebase read error:', err);
    throw err;
  }
  if (!snapshot.exists()) throw new Error('No questions found for board ' + boardKey);
  const rawData = snapshot.val();
  const arr = Array.isArray(rawData) ? rawData : Object.values(rawData);
  const result = selectedCategoryNames.map(function(name) {
    const found = arr.find(function(c) {
      return c && c.name && c.name.toLowerCase() === name.toLowerCase();
    });
    if (!found) { console.warn('[fetchQuestions] Not found:', name); return { name: name, questions: [] }; }
    const questions = Array.isArray(found.questions) ? found.questions : Object.values(found.questions || {});
    return { name: found.name, questions: questions };
  });
  return result;
}

// ─── Daily Double selection with row² weighting ───────────────────────────────
// Row indices are 0-based internally; weight = (row+1)²
// Board B gets TWO daily doubles (must be in different cells)

function pickDailyDoubles(boardKey, categories) {
  const numRows = BOARD_POINT_VALUES[boardKey].length;
  // Build weighted tile pool
  const pool = [];
  categories.forEach(function(cat, ci) {
    cat.questionOrder.forEach(function(qi, row) {
      const weight = (row + 1) * (row + 1); // row² weighting
      for (let w = 0; w < weight; w++) {
        pool.push({ catIndex: ci, qIndex: qi, row: row });
      }
    });
  });

  if (pool.length === 0) return [];

  function pickOne(excludeTile) {
    let filtered = excludeTile
      ? pool.filter(function(t) { return !(t.catIndex === excludeTile.catIndex && t.qIndex === excludeTile.qIndex); })
      : pool;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  if (boardKey === 'B') {
    const first = pickOne(null);
    const second = pickOne(first);
    return [
      { catIndex: first.catIndex, qIndex: first.qIndex },
      { catIndex: second.catIndex, qIndex: second.qIndex }
    ];
  } else {
    const picked = pickOne(null);
    return [{ catIndex: picked.catIndex, qIndex: picked.qIndex }];
  }
}

// ─── Build game board ─────────────────────────────────────────────────────────

function buildGameBoard(boardKey, selectedCategoryNames, categoriesData) {
  console.log('[buildGameBoard] Building board:', boardKey);
  const pointValues = BOARD_POINT_VALUES[boardKey];
  if (!pointValues) { console.error('[buildGameBoard] Unknown boardKey:', boardKey); return null; }

  const categories = categoriesData.map(function(cat, i) {
    const qCount = cat.questions ? cat.questions.length : 0;
    const questionOrder = Array.from({ length: qCount }, function(_, k) { return k; });
    return { name: cat.name, questionOrder: questionOrder };
  });

  const dailyDoubles = pickDailyDoubles(boardKey, categories);
  console.log('[buildGameBoard] Daily doubles:', JSON.stringify(dailyDoubles));

  if (dailyDoubles.length === 0) { console.error('[buildGameBoard] No tiles for daily double'); return null; }

  return { boardKey: boardKey, categories: categories, dailyDoubles: dailyDoubles, pointValues: pointValues };
}

console.log('[boards.js] Ready');
