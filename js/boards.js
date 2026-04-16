const ALL_CATEGORIES = {
  A: {
    pointValues: [100, 200, 300, 400, 500],
    categories: [
      'History',
      'Science',
      'Geography',
      'Pop Culture',
      'Food & Drink',
      'Sports',
      'Art & Literature',
      'World Leaders',
      'Animals',
      'Language & Words'
    ]
  },
  B: {
    pointValues: [200, 400, 600, 800, 1000],
    categories: [
      'Literature',
      'Technology',
      'World Capitals',
      'Music',
      'Mythology',
      'Mathematics',
      'Cinema',
      'Nature',
      'Space',
      'Philosophy'
    ]
  }
};

async function fetchQuestions(boardKey, selectedCategoryNames) {
  const res = await fetch(
    `https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_PRIVATE_REPO/main/questions/${boardKey}.json`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error('Could not load questions');
  const all = await res.json();
  return selectedCategoryNames.map(name => {
    const found = all.find(c => c.name === name);
    return found || { name, questions: [] };
  });
}

function buildGameBoard(boardKey, selectedCategoryNames, categoriesData) {
  const board = ALL_CATEGORIES[boardKey];
  if (!board) return null;

  const categories = categoriesData.map(cat => {
    const shuffledOrder = [...Array(cat.questions.length).keys()]
      .sort(() => Math.random() - 0.5);
    return { name: cat.name, questionOrder: shuffledOrder };
  });

  const allTiles = [];
  categories.forEach((cat, ci) => {
    cat.questionOrder.forEach((qi) => {
      allTiles.push({ catIndex: ci, qIndex: qi });
    });
  });

  const randomTile = allTiles[Math.floor(Math.random() * allTiles.length)];
  const dailyDouble = { catIndex: randomTile.catIndex, qIndex: randomTile.qIndex };

  return {
    boardKey,
    categories,
    dailyDouble,
    pointValues: board.pointValues
  };
}
