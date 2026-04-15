const BOARDS = {
  A: {
    label: 'Board A',
    pointValues: [100, 200, 300, 400, 500],
    categories: [
      {
        name: 'History',
        questions: [
          { q: 'This ancient wonder stood at the entrance of a Greek harbor', a: 'The Colossus of Rhodes' },
          { q: 'This empire was ruled by Genghis Khan in the 13th century', a: 'The Mongol Empire' },
          { q: 'The year the Berlin Wall fell', a: '1989' },
          { q: 'She was the first woman to win a Nobel Prize', a: 'Marie Curie' },
          { q: 'This 1215 document limited the power of the English king', a: 'The Magna Carta' },
        ]
      },
      {
        name: 'Science',
        questions: [
          { q: 'The chemical symbol for gold', a: 'Au' },
          { q: 'This planet has the most moons in our solar system', a: 'Saturn' },
          { q: 'The process by which plants make food from sunlight', a: 'Photosynthesis' },
          { q: 'The speed of light is approximately this many kilometers per second', a: '300,000' },
          { q: 'This scientist published the theory of general relativity in 1915', a: 'Albert Einstein' },
        ]
      },
      {
        name: 'Geography',
        questions: [
          { q: 'The longest river in the world', a: 'The Nile' },
          { q: 'This country has the most natural lakes', a: 'Canada' },
          { q: 'The capital city of Australia', a: 'Canberra' },
          { q: 'The smallest country in the world by area', a: 'Vatican City' },
          { q: 'This mountain range separates Europe from Asia', a: 'The Ural Mountains' },
        ]
      },
      {
        name: 'Pop Culture',
        questions: [
          { q: 'The fictional kingdom in the movie Frozen', a: 'Arendelle' },
          { q: 'This band performed the song "Bohemian Rhapsody"', a: 'Queen' },
          { q: 'The number of seasons in the original run of Friends', a: '10' },
          { q: 'She played Katniss Everdeen in The Hunger Games films', a: 'Jennifer Lawrence' },
          { q: 'The sport played in the movie Space Jam', a: 'Basketball' },
        ]
      },
      {
        name: 'Food & Drink',
        questions: [
          { q: 'This Italian city is credited as the birthplace of pizza', a: 'Naples' },
          { q: 'The main ingredient in guacamole', a: 'Avocado' },
          { q: 'This country is the largest producer of coffee in the world', a: 'Brazil' },
          { q: 'Sushi is traditionally made with this type of rice', a: 'Short-grain rice' },
          { q: 'This French sauce is made from egg yolks and butter', a: 'Hollandaise' },
        ]
      },
      {
        name: 'Sports',
        questions: [
          { q: 'The number of players on a basketball team on the court at one time', a: '5' },
          { q: 'The country that has won the most FIFA World Cups', a: 'Brazil' },
          { q: 'This athlete holds the record for most Olympic gold medals', a: 'Michael Phelps' },
          { q: 'The four tennis tournaments that make up the Grand Slam', a: 'Australian Open, French Open, Wimbledon, US Open' },
          { q: 'The distance of a marathon in kilometers', a: '42.195 km' },
        ]
      },
    ]
  },

  B: {
    label: 'Board B',
    pointValues: [200, 400, 600, 800, 1000],
    categories: [
      {
        name: 'Literature',
        questions: [
          { q: 'The author of Don Quixote', a: 'Miguel de Cervantes' },
          { q: 'This Dickens novel begins with "It was the best of times, it was the worst of times"', a: 'A Tale of Two Cities' },
          { q: 'The fictional detective who lived at 221B Baker Street', a: 'Sherlock Holmes' },
          { q: 'George Orwell wrote this dystopian novel set in 1984', a: 'Nineteen Eighty-Four' },
          { q: 'The author of One Hundred Years of Solitude', a: 'Gabriel García Márquez' },
        ]
      },
      {
        name: 'Technology',
        questions: [
          { q: 'The programming language created by Guido van Rossum in 1991', a: 'Python' },
          { q: 'This company created the iPhone', a: 'Apple' },
          { q: 'The full form of HTTP', a: 'HyperText Transfer Protocol' },
          { q: 'This company owns Instagram and WhatsApp', a: 'Meta' },
          { q: 'The first commercially successful web browser', a: 'Netscape Navigator' },
        ]
      },
      {
        name: 'World Capitals',
        questions: [
          { q: 'The capital of Canada', a: 'Ottawa' },
          { q: 'The capital of Brazil', a: 'Brasília' },
          { q: 'The capital of Japan', a: 'Tokyo' },
          { q: 'The capital of South Africa (administrative)', a: 'Pretoria' },
          { q: 'The capital of New Zealand', a: 'Wellington' },
        ]
      },
      {
        name: 'Music',
        questions: [
          { q: 'The composer of the Four Seasons', a: 'Antonio Vivaldi' },
          { q: 'This music genre originated in Jamaica in the late 1960s', a: 'Reggae' },
          { q: 'The lead singer of the Rolling Stones', a: 'Mick Jagger' },
          { q: 'The number of strings on a standard guitar', a: '6' },
          { q: 'This artist released the album "Thriller" in 1982', a: 'Michael Jackson' },
        ]
      },
      {
        name: 'Mythology',
        questions: [
          { q: 'The Greek god of the sea', a: 'Poseidon' },
          { q: 'This Norse god wields a hammer called Mjölnir', a: 'Thor' },
          { q: 'The Egyptian god of the dead and the afterlife', a: 'Osiris' },
          { q: 'The hero who killed the Minotaur in the labyrinth', a: 'Theseus' },
          { q: 'The Roman equivalent of the Greek god Ares', a: 'Mars' },
        ]
      },
      {
        name: 'Mathematics',
        questions: [
          { q: 'The value of pi to two decimal places', a: '3.14' },
          { q: 'The square root of 144', a: '12' },
          { q: 'This theorem states that a² + b² = c² in a right triangle', a: "The Pythagorean Theorem" },
          { q: 'The number of degrees in a full circle', a: '360' },
          { q: 'The only even prime number', a: '2' },
        ]
      },
    ]
  }
};

function buildGameBoard(boardKey) {
  const board = BOARDS[boardKey];
  if (!board) return null;

  const categories = board.categories.map(cat => {
    const shuffledOrder = [...Array(cat.questions.length).keys()]
      .sort(() => Math.random() - 0.5);

    return {
      name: cat.name,
      questionOrder: shuffledOrder
    };
  });

  const allTiles = [];
  categories.forEach((cat, ci) => {
    cat.questionOrder.forEach((qi, row) => {
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
