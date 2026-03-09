const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'db.sqlite');
const db = new Database(dbFile);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'user',
  theme TEXT DEFAULT 'dark',
  avatar TEXT DEFAULT '',
  shareToken TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  genre TEXT DEFAULT '',
  language TEXT DEFAULT 'English',
  releaseYear INTEGER DEFAULT 0,
  totalEpisodes INTEGER DEFAULT 0,
  totalSeasons INTEGER DEFAULT 1,
  coverImage TEXT DEFAULT '',
  streamingLinks TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  score REAL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  showId INTEGER NOT NULL,
  status TEXT DEFAULT 'Plan to Watch',
  watchedEpisodes INTEGER DEFAULT 0,
  rating INTEGER DEFAULT NULL,
  review TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  addedAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(userId, showId)
);

CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  creatorId INTEGER,
  showId INTEGER,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS club_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clubId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  joinedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(clubId, userId)
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clubId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  content TEXT NOT NULL,
  spoiler INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  showId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  content TEXT NOT NULL,
  spoiler INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clubId INTEGER,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  createdBy INTEGER,
  endsAt TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pollId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  optionIndex INTEGER NOT NULL,
  votedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(pollId, userId)
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  showId INTEGER NOT NULL,
  reminderDate TEXT NOT NULL,
  note TEXT DEFAULT '',
  triggered INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  showId INTEGER NOT NULL,
  episodesWatched INTEGER DEFAULT 0,
  minutesWatched INTEGER DEFAULT 0,
  logDate TEXT DEFAULT (date('now')),
  createdAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  isRead INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now'))
);
`);
// ── Database Migrations ────────────────────────────────────────────────────────
try {
  db.prepare("ALTER TABLE shows ADD COLUMN score REAL DEFAULT 0").run();
} catch (e) {
  // Column already exists
}

// ── Seed data ──────────────────────────────────────────────────────────────────
const countUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (countUsers === 0) {
  db.prepare("INSERT INTO users (name, email, password, role, shareToken) VALUES (?, ?, ?, ?, ?)").run('Demo User', 'user@demo.com', 'password', 'user', 'share_demo_user_abc123');
  db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run('Admin', 'admin@demo.com', 'adminpass', 'admin');
}

const countShows = db.prepare('SELECT COUNT(*) as c FROM shows').get().c;
if (countShows === 0) {
  const ins = db.prepare('INSERT INTO shows (title, description, genre, language, releaseYear, totalEpisodes, totalSeasons, tags, streamingLinks, coverImage, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run('Fullmetal Alchemist: Brotherhood', 'Two brothers search for the Philosopher\'s Stone after a failed alchemical experiment.', 'Action', 'Japanese', 2009, 64, 1, JSON.stringify(['Action', 'Fantasy', 'Shounen']), JSON.stringify(['https://www.crunchyroll.com/']), 'https://cdn.myanimelist.net/images/anime/1223/96541.jpg', 9.1);
  ins.run('One Punch Man', 'A superhero who can defeat any opponent with one punch.', 'Action', 'Japanese', 2015, 12, 2, JSON.stringify(['Action', 'Comedy', 'Superhero']), JSON.stringify(['https://www.netflix.com/']), 'https://cdn.myanimelist.net/images/anime/12/76049.jpg', 8.5);
  ins.run('Attack on Titan', 'Humanity fights for survival against giant humanoid titans.', 'Action', 'Japanese', 2013, 87, 4, JSON.stringify(['Action', 'Drama', 'Mystery']), JSON.stringify(['https://www.crunchyroll.com/']), 'https://cdn.myanimelist.net/images/anime/10/47347.jpg', 8.5);
  ins.run('Stranger Things', 'A group of kids uncover supernatural mysteries in their small town.', 'Sci-Fi', 'English', 2016, 34, 4, JSON.stringify(['Sci-Fi', 'Drama', 'Horror']), JSON.stringify(['https://www.netflix.com/']), 'https://m.media-amazon.com/images/M/MV5BMDZkYmVhNjMtNWU4MC00MDQxLWE3MjYtZGMzZWI1ZjhlOWJmXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_FMjpg_UX1000_.jpg', 8.7);
  ins.run('Breaking Bad', 'A chemistry teacher turns to manufacturing meth after a cancer diagnosis.', 'Drama', 'English', 2008, 62, 5, JSON.stringify(['Drama', 'Crime', 'Thriller']), JSON.stringify(['https://www.netflix.com/']), 'https://image.tmdb.org/t/p/w600_and_h900_bestv2/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', 9.5);
  ins.run('Demon Slayer', 'A young boy becomes a demon slayer after his family is slaughtered.', 'Action', 'Japanese', 2019, 44, 3, JSON.stringify(['Action', 'Fantasy', 'Shounen']), JSON.stringify(['https://www.crunchyroll.com/']), 'https://cdn.myanimelist.net/images/anime/1286/99889.jpg', 8.5);
  ins.run('The Witcher', 'A mutated monster hunter struggles to find his place in a world where people and monsters are equally evil.', 'Fantasy', 'English', 2019, 24, 3, JSON.stringify(['Fantasy', 'Action', 'Drama']), JSON.stringify(['https://www.netflix.com/']), 'https://image.tmdb.org/t/p/w600_and_h900_bestv2/7vjaCdMw15FEbXyLQTVa04URsPm.jpg', 8.0);
  ins.run('Naruto Shippuden', 'Naruto fights to protect his village and rescue his friend Sasuke.', 'Action', 'Japanese', 2007, 500, 1, JSON.stringify(['Action', 'Adventure', 'Shounen']), JSON.stringify(['https://www.crunchyroll.com/']), 'https://cdn.myanimelist.net/images/anime/5/17407.jpg', 8.2);
}

const countWatchlist = db.prepare('SELECT COUNT(*) as c FROM watchlist').get().c;
if (countWatchlist === 0) {
  const wl = db.prepare('INSERT INTO watchlist (userId, showId, status, watchedEpisodes, rating) VALUES (?, ?, ?, ?, ?)');
  wl.run(1, 1, 'Watching', 10, 9);
  wl.run(1, 2, 'Completed', 12, 8);
  wl.run(1, 3, 'Plan to Watch', 0, null);
  wl.run(1, 4, 'Watching', 5, 8);
  wl.run(1, 5, 'On Hold', 30, 7);
  wl.run(1, 6, 'Dropped', 5, null);
  wl.run(1, 7, 'Plan to Watch', 0, null);

  // Watch history for analytics
  const hist = db.prepare('INSERT INTO watch_history (userId, showId, episodesWatched, minutesWatched, logDate) VALUES (?, ?, ?, ?, ?)');
  hist.run(1, 1, 3, 75, '2026-02-18');
  hist.run(1, 2, 2, 50, '2026-02-19');
  hist.run(1, 4, 1, 48, '2026-02-20');
  hist.run(1, 1, 2, 50, '2026-02-21');
  hist.run(1, 5, 4, 200, '2026-02-22');
  hist.run(1, 6, 5, 110, '2026-02-23');
  hist.run(1, 1, 3, 75, '2026-02-24');
  hist.run(1, 4, 4, 192, '2026-02-25');
}

const countClubs = db.prepare('SELECT COUNT(*) as c FROM clubs').get().c;
if (countClubs === 0) {
  db.prepare("INSERT INTO clubs (name, description, creatorId, showId) VALUES (?, ?, ?, ?)").run('Anime Lovers Hub', 'Share your favourite anime moments and recommendations!', 1, null);
  db.prepare("INSERT INTO clubs (name, description, creatorId, showId) VALUES (?, ?, ?, ?)").run('FMA Brotherhood Fan Club', 'All things Fullmetal Alchemist Brotherhood', 1, 1);
  db.prepare("INSERT INTO clubs (name, description, creatorId, showId) VALUES (?, ?, ?, ?)").run('Isekai Protagonists', 'Discussing our favorite overpowered MCs in another world.', 1, null);
  db.prepare("INSERT INTO clubs (name, description, creatorId, showId) VALUES (?, ?, ?, ?)").run('Sci-Fi & Cyberpunk', 'For fans of futuristic, dystopian, and tech-heavy series.', 1, null);
  db.prepare("INSERT INTO clubs (name, description, creatorId, showId) VALUES (?, ?, ?, ?)").run('Waifu/Husbando Wars', 'Respectful debates on who the best characters are.', 1, null);
  db.prepare("INSERT INTO clubs (name, description, creatorId, showId) VALUES (?, ?, ?, ?)").run('Manga Readers', 'For those who prefer reading ahead of the anime.', 1, null);
  db.prepare("INSERT INTO clubs (name, description, creatorId, showId) VALUES (?, ?, ?, ?)").run('Ghibli Enthusiasts', 'Discussing the magical movies of Studio Ghibli.', 1, null);

  db.prepare("INSERT INTO club_members (clubId, userId) VALUES (?, ?)").run(1, 1);
  db.prepare("INSERT INTO club_members (clubId, userId) VALUES (?, ?)").run(2, 1);

  const post = db.prepare('INSERT INTO posts (clubId, userId, content, spoiler) VALUES (?, ?, ?, ?)');
  post.run(1, 1, 'Just finished One Punch Man Season 1 — absolutely loved it! Anyone have recommendations for similar shows?', 0);
  post.run(2, 1, 'WARNING SPOILER AHEAD: The gate scene where Ed loses his arm... incredible animation.', 1);
}

const countPolls = db.prepare('SELECT COUNT(*) as c FROM polls').get().c;
if (countPolls === 0) {
  db.prepare("INSERT INTO polls (clubId, question, options, createdBy) VALUES (?, ?, ?, ?)").run(1, 'Who is the best anime protagonist?', JSON.stringify(['Edward Elric', 'Naruto Uzumaki', 'Gon Freecss', 'Tanjiro Kamado']), 1);
  db.prepare("INSERT INTO polls (clubId, question, options, createdBy) VALUES (?, ?, ?, ?)").run(1, 'Best anime genre?', JSON.stringify(['Action/Shonen', 'Isekai', 'Slice of Life', 'Mecha']), 1);
}

const countReminders = db.prepare('SELECT COUNT(*) as c FROM reminders').get().c;
if (countReminders === 0) {
  db.prepare("INSERT INTO reminders (userId, showId, reminderDate, note) VALUES (?, ?, ?, ?)").run(1, 3, '2026-03-01', 'Start Attack on Titan!');
  db.prepare("INSERT INTO reminders (userId, showId, reminderDate, note) VALUES (?, ?, ?, ?)").run(1, 4, '2026-02-28', 'Continue Stranger Things S2');
}

const countComments = db.prepare('SELECT COUNT(*) as c FROM comments').get().c;
if (countComments === 0) {
  db.prepare("INSERT INTO comments (showId, userId, content, spoiler) VALUES (?, ?, ?, ?)").run(1, 1, 'One of the best anime ever created. The story, characters and animation are all top tier!', 0);
  db.prepare("INSERT INTO comments (showId, userId, content, spoiler) VALUES (?, ?, ?, ?)").run(2, 1, 'Season 1 was perfect. Season 2 felt a bit rushed but still great fun.', 0);
}

module.exports = db;
