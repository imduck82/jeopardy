// boards.js — Board definitions and Firebase question fetching
// No ES module imports; relies on firebase.js (compat SDK) already loaded via <script> tag

console.log('[boards.js] Script loaded');

// Point values per board — categories come from Firebase, not hardcoded
const BOARD_POINT_VALUES = {
  A: [100, 200, 300, 400, 500],
  B: [200, 400, 600, 800, 1000]
};

console.log('[boards.js] BOARD_POINT_VALUES defined:', Object.keys(BOARD_POINT_VALUES));

/**
 * Signs in anonymously so Firebase Security Rules allow reads.
 */
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

/**
 * Fetches all available category names for a board from Firebase.
 * Returns an array of category name strings.
 */
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

  if (!snapshot.exists()) {
    console.error('[fetchCategoryNames] No data at questions/' + boardKey);
    throw new Error('No questions found for board ' + boardKey);
  }

  const rawData = snapshot.val();
  const categoriesArray = Array.isArray(rawData) ? rawData : Object.values(rawData);
  const names = categoriesArray.filter(c => c && c.name).map(c => c.name);
  console.log('[fetchCategoryNames] Found', names.length, 'categories:', names);
  return names;
}

/**
 * Fetches questions for the selected board and category names from Firebase.
 */
async function fetchQuestions(boardKey, selectedCategoryNames) {
  console.log('[fetchQuestions] Fetching board:', boardKey, '| categories:', selectedCategoryNames);

  let snapshot;
  try {
    snapshot = await db.ref('questions/' + boardKey).once('value');
  } catch (err) {
    console.error('[fetchQuestions] Firebase read error:', err);
    throw err;
  }

  if (!snapshot.exists()) {
    throw new Error('No questions found for board ' + boardKey);
  }

  const rawData = snapshot.val();
  const categoriesArray = Array.isArray(rawData) ? rawData : Object.values(rawData);

  const result = selectedCategoryNames.map(name => {
    const found = categoriesArray.find(
      c => c && c.name && c.name.toLowerCase() === name.toLowerCase()
    );
    if (!found) {
      console.warn('[fetchQuestions] Category not found in Firebase:', name);
      return { name, questions: [] };
    }
    const questions = Array.isArray(found.questions)
      ? found.questions
      : Object.values(found.questions || {});
    console.log('[fetchQuestions] Matched "' + name + '" | questions:', questions.length);
    return { name: found.name, questions };
  });

  console.log('[fetchQuestions] Done. Returning', result.length, 'categories');
  return result;
}

/**
 * Builds the in-memory game board structure.
 * Questions are kept in their ORIGINAL Firebase order — NO shuffle.
 */
function buildGameBoard(boardKey, selectedCategoryNames, categoriesData) {
  console.log('[buildGameBoard] Building board:', boardKey);

  const pointValues = BOARD_POINT_VALUES[boardKey];
  if (!pointValues) {
    console.error('[buildGameBoard] Unknown boardKey:', boardKey);
    return null;
  }

  const categories = categoriesData.map((cat, i) => {
    const qCount = cat.questions ? cat.questions.length : 0;
    console.log('[buildGameBoard] Category[' + i + '] "' + cat.name + '" has ' + qCount + ' questions');
    // Preserve original order — indices are sequential [0, 1, 2, ...]
    const questionOrder = Array.from({ length: qCount }, function(_, k) { return k; });
    return { name: cat.name, questionOrder: questionOrder };
  });

  // Pick a random daily double
  const allTiles = [];
  categories.forEach(function(cat, ci) {
    cat.questionOrder.forEach(function(qi) {
      allTiles.push({ catIndex: ci, qIndex: qi });
    });
  });

  if (allTiles.length === 0) {
    console.error('[buildGameBoard] No tiles available');
    return null;
  }

  const randomTile = allTiles[Math.floor(Math.random() * allTiles.length)];
  const dailyDouble = { catIndex: randomTile.catIndex, qIndex: randomTile.qIndex };
  console.log('[buildGameBoard] Daily double → catIndex:', dailyDouble.catIndex, 'qIndex:', dailyDouble.qIndex);

  const gameBoard = { boardKey: boardKey, categories: categories, dailyDouble: dailyDouble, pointValues: pointValues };
  console.log('[buildGameBoard] Board built successfully');
  return gameBoard;
}

console.log('[boards.js] Ready. Exposed: initAuth, fetchCategoryNames, fetchQuestions, buildGameBoard');
