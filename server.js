const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Middleware ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (userId) {
    req.userId = parseInt(userId);
  }
  next();
});

// ── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const shareToken = 'share_' + Math.random().toString(36).substr(2, 9);
    const info = db.prepare('INSERT INTO users (name, email, password, shareToken) VALUES (?, ?, ?, ?)').run(name, email, password, shareToken);
    const userId = info.lastInsertRowid;
    // Create Welcome Notification for the new user
    db.prepare('INSERT INTO notifications (userId, title, message) VALUES (?, ?, ?)').run(userId, 'Welcome to AnimeTrack!', `Hi ${name}! Thanks for joining. You can start by adding shows to your watchlist.`);

    // Notify Admin (User 1) about the new user
    if (userId !== 1) {
      db.prepare('INSERT INTO notifications (userId, title, message) VALUES (?, ?, ?)').run(1, 'New User Joined!', `${name} has just created an account. Welcoming them to the community!`);
    }

    res.json({ userId, name });
  } catch (e) {
    console.error('Registration Error:', e);
    if (e.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Database error. Please try again.' });
    }
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT id, name FROM users WHERE email = ? AND password = ?').get(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ userId: user.id, name: user.name });
});

// ── Notification Routes ──────────────────────────────────────────────────────
app.get('/api/notifications', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const rows = db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  res.json(rows.map(r => ({ ...r, isRead: !!r.isRead })));
});

app.put('/api/notifications/read', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ?').run(userId);
  res.json({ ok: true });
});
function parseShow(r) {
  if (!r) return null;
  return { ...r, tags: JSON.parse(r.tags || '[]'), streamingLinks: JSON.parse(r.streamingLinks || '[]') };
}
function parsePoll(p) {
  if (!p) return null;
  return { ...p, options: JSON.parse(p.options || '[]') };
}

// ======================================================================
// SHOWS
// ======================================================================
app.get('/api/shows', (req, res) => {
  const { genre, language, year, q, tags } = req.query;
  let sql = 'SELECT * FROM shows WHERE 1=1';
  const params = [];
  if (genre) { sql += ' AND genre = ?'; params.push(genre); }
  if (language) { sql += ' AND language = ?'; params.push(language); }
  if (year) { sql += ' AND releaseYear = ?'; params.push(Number(year)); }
  if (q) { sql += ' AND (title LIKE ?)'; params.push(`%${q}%`); }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params);
  if (tags) {
    const tagArr = tags.split(',').map(t => t.trim().toLowerCase());
    const filtered = rows.filter(r => {
      const t = JSON.parse(r.tags || '[]').map(x => x.toLowerCase());
      return tagArr.some(tag => t.includes(tag));
    });
    return res.json(filtered.map(parseShow));
  }
  res.json(rows.map(parseShow));
});

app.get('/api/shows/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseShow(row));
});

app.post('/api/shows', (req, res) => {
  const { title, description = '', genre = '', language = 'English', releaseYear = 0, totalEpisodes = 0, totalSeasons = 1, tags = [], streamingLinks = [], score = 0 } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const info = db.prepare('INSERT INTO shows (title, description, genre, language, releaseYear, totalEpisodes, totalSeasons, tags, streamingLinks, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(title, description, genre, language, releaseYear, totalEpisodes, totalSeasons, JSON.stringify(tags), JSON.stringify(streamingLinks), score);
  res.json(parseShow(db.prepare('SELECT * FROM shows WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/shows/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const { title, description, genre, language, releaseYear, totalEpisodes, totalSeasons, tags, streamingLinks, score } = req.body;
  db.prepare('UPDATE shows SET title=?, description=?, genre=?, language=?, releaseYear=?, totalEpisodes=?, totalSeasons=?, tags=?, streamingLinks=?, score=? WHERE id=?')
    .run(
      title ?? cur.title, description ?? cur.description, genre ?? cur.genre,
      language ?? cur.language, releaseYear ?? cur.releaseYear,
      totalEpisodes ?? cur.totalEpisodes, totalSeasons ?? cur.totalSeasons,
      tags ? JSON.stringify(tags) : cur.tags, streamingLinks ? JSON.stringify(streamingLinks) : cur.streamingLinks,
      score ?? cur.score,
      req.params.id
    );
  res.json(parseShow(db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id)));
});

app.delete('/api/shows/:id', (req, res) => {
  db.prepare('DELETE FROM shows WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM watchlist WHERE showId = ?').run(req.params.id);
  db.prepare('DELETE FROM reminders WHERE showId = ?').run(req.params.id);
  db.prepare('DELETE FROM comments WHERE showId = ?').run(req.params.id);
  res.json({ ok: true });
});

// ======================================================================
// WATCHLIST (per user)
// ======================================================================
app.get('/api/watchlist', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { status } = req.query;
  let sql = `SELECT w.*, s.title, s.description, s.genre, s.language, s.releaseYear, s.totalEpisodes, s.totalSeasons, s.tags, s.streamingLinks, s.coverImage, s.score
             FROM watchlist w JOIN shows s ON w.showId = s.id WHERE w.userId = ?`;
  const params = [userId];
  if (status && status !== 'All') { sql += ' AND w.status = ?'; params.push(status); }
  sql += ' ORDER BY w.updatedAt DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({
    ...r,
    tags: JSON.parse(r.tags || '[]'),
    streamingLinks: JSON.parse(r.streamingLinks || '[]')
  })));
});

app.put('/api/watchlist/:showId', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const showId = req.params.showId;
  const { status, watchedEpisodes, rating, review, notes } = req.body;

  const existing = db.prepare('SELECT * FROM watchlist WHERE userId = ? AND showId = ?').get(userId, showId);
  if (existing) {
    db.prepare('UPDATE watchlist SET status=?, watchedEpisodes=?, rating=?, review=?, notes=?, updatedAt=datetime(\'now\') WHERE userId=? AND showId=?')
      .run(status ?? existing.status, watchedEpisodes ?? existing.watchedEpisodes, rating ?? existing.rating, review ?? existing.review, notes ?? existing.notes, userId, showId);
  } else {
    db.prepare('INSERT INTO watchlist (userId, showId, status, watchedEpisodes, rating, review, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, showId, status || 'Plan to Watch', watchedEpisodes || 0, rating || null, review || '', notes || '');
  }

  // Log to watch history if episodes updated
  if (watchedEpisodes != null) {
    const prev = existing ? existing.watchedEpisodes : 0;
    const diff = (watchedEpisodes || 0) - prev;
    if (diff > 0) {
      db.prepare('INSERT INTO watch_history (userId, showId, episodesWatched, minutesWatched) VALUES (?, ?, ?, ?)')
        .run(userId, showId, diff, diff * 24);
    }
  }

  res.json({ ok: true });
});

app.delete('/api/watchlist/:showId', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  db.prepare('DELETE FROM watchlist WHERE userId = ? AND showId = ?').run(userId, req.params.showId);
  res.json({ ok: true });
});

// ======================================================================
// CLUBS
// ======================================================================
app.get('/api/clubs', (req, res) => {
  const clubs = db.prepare(`SELECT c.*, u.name as creatorName, COUNT(cm.userId) as memberCount
    FROM clubs c LEFT JOIN users u ON c.creatorId = u.id
    LEFT JOIN club_members cm ON c.id = cm.clubId
    GROUP BY c.id ORDER BY c.id DESC`).all();

  // Check membership for current user
  const userId = req.userId;
  const userClubs = userId ? db.prepare(`SELECT clubId FROM club_members WHERE userId = ?`).all(userId).map(r => r.clubId) : [];
  const clubsWithMembership = clubs.map(c => ({ ...c, isMember: userClubs.includes(c.id) }));

  res.json(clubsWithMembership);
});

app.post('/api/clubs', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { name, description = '', showId = null } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const info = db.prepare('INSERT INTO clubs (name, description, creatorId, showId) VALUES (?, ?, ?, ?)').run(name, description, userId, showId);
  db.prepare('INSERT OR IGNORE INTO club_members (clubId, userId) VALUES (?, ?)').run(info.lastInsertRowid, userId);
  res.json(db.prepare('SELECT * FROM clubs WHERE id = ?').get(info.lastInsertRowid));
});

app.post('/api/clubs/:id/join', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  db.prepare('INSERT OR IGNORE INTO club_members (clubId, userId) VALUES (?, ?)').run(req.params.id, userId);
  res.json({ ok: true });
});

app.delete('/api/clubs/:id', (req, res) => {
  db.prepare('DELETE FROM clubs WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM club_members WHERE clubId = ?').run(req.params.id);
  db.prepare('DELETE FROM posts WHERE clubId = ?').run(req.params.id);
  db.prepare('DELETE FROM polls WHERE clubId = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Club Posts ───────────────────────────────────────────────────────
app.get('/api/clubs/:id/posts', (req, res) => {
  const posts = db.prepare(`SELECT p.*, u.name as userName FROM posts p LEFT JOIN users u ON p.userId = u.id WHERE p.clubId = ? ORDER BY p.createdAt DESC`).all(req.params.id);
  res.json(posts.map(p => ({ ...p, spoiler: !!p.spoiler })));
});

app.post('/api/clubs/:id/posts', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { content = '', spoiler = false } = req.body;
  if (!content.trim()) return res.status(400).json({ error: 'Content required' });
  const info = db.prepare('INSERT INTO posts (clubId, userId, content, spoiler) VALUES (?, ?, ?, ?)').run(req.params.id, userId, content, spoiler ? 1 : 0);
  const post = db.prepare(`SELECT p.*, u.name as userName FROM posts p LEFT JOIN users u ON p.userId = u.id WHERE p.id = ?`).get(info.lastInsertRowid);
  res.json({ ...post, spoiler: !!post.spoiler });
});

app.delete('/api/posts/:id', (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ======================================================================
// COMMENTS (per show)
// ======================================================================
app.get('/api/shows/:id/comments', (req, res) => {
  const comments = db.prepare(`SELECT c.*, u.name as userName FROM comments c LEFT JOIN users u ON c.userId = u.id WHERE c.showId = ? ORDER BY c.createdAt DESC`).all(req.params.id);
  res.json(comments.map(c => ({ ...c, spoiler: !!c.spoiler })));
});

app.post('/api/shows/:id/comments', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { content = '', spoiler = false } = req.body;
  if (!content.trim()) return res.status(400).json({ error: 'Content required' });
  const info = db.prepare('INSERT INTO comments (showId, userId, content, spoiler) VALUES (?, ?, ?, ?)').run(req.params.id, userId, content, spoiler ? 1 : 0);
  const comment = db.prepare(`SELECT c.*, u.name as userName FROM comments c LEFT JOIN users u ON c.userId = u.id WHERE c.id = ?`).get(info.lastInsertRowid);
  res.json({ ...comment, spoiler: !!comment.spoiler });
});

app.delete('/api/comments/:id', (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ======================================================================
// POLLS
// ======================================================================
app.get('/api/clubs/:id/polls', (req, res) => {
  const userId = req.userId;
  const polls = db.prepare('SELECT * FROM polls WHERE clubId = ? ORDER BY createdAt DESC').all(req.params.id);
  res.json(polls.map(p => {
    const options = JSON.parse(p.options || '[]');
    const votes = db.prepare('SELECT optionIndex, COUNT(*) as count FROM poll_votes WHERE pollId = ? GROUP BY optionIndex').all(p.id);
    const voteMap = {};
    votes.forEach(v => voteMap[v.optionIndex] = v.count);
    const userVote = userId ? db.prepare('SELECT optionIndex FROM poll_votes WHERE pollId = ? AND userId = ?').get(p.id, userId) : null;
    return { ...p, options, votes: voteMap, userVote: userVote ? userVote.optionIndex : null };
  }));
});

app.post('/api/clubs/:id/polls', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { question, options = [] } = req.body;
  if (!question || options.length < 2) return res.status(400).json({ error: 'Question and at least 2 options required' });
  const info = db.prepare('INSERT INTO polls (clubId, question, options, createdBy) VALUES (?, ?, ?, ?)').run(req.params.id, question, JSON.stringify(options), userId);
  res.json(parsePoll(db.prepare('SELECT * FROM polls WHERE id = ?').get(info.lastInsertRowid)));
});

app.post('/api/polls/:id/vote', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { optionIndex } = req.body;
  if (optionIndex == null) return res.status(400).json({ error: 'optionIndex required' });
  try {
    db.prepare('INSERT INTO poll_votes (pollId, userId, optionIndex) VALUES (?, ?, ?)').run(req.params.id, userId, optionIndex);
  } catch (e) {
    db.prepare('UPDATE poll_votes SET optionIndex = ? WHERE pollId = ? AND userId = ?').run(optionIndex, req.params.id, userId);
  }
  res.json({ ok: true });
});

// ======================================================================
// REMINDERS
// ======================================================================
app.get('/api/reminders', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const rows = db.prepare(`SELECT r.*, s.title as showTitle FROM reminders r JOIN shows s ON r.showId = s.id WHERE r.userId = ? ORDER BY r.reminderDate ASC`).all(userId);
  res.json(rows);
});

app.post('/api/reminders', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { showId, reminderDate, note = '' } = req.body;
  if (!showId || !reminderDate) return res.status(400).json({ error: 'showId and reminderDate required' });
  const info = db.prepare('INSERT INTO reminders (userId, showId, reminderDate, note) VALUES (?, ?, ?, ?)').run(userId, showId, reminderDate, note);
  res.json(db.prepare('SELECT r.*, s.title as showTitle FROM reminders r JOIN shows s ON r.showId = s.id WHERE r.id = ?').get(info.lastInsertRowid));
});

app.delete('/api/reminders/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ======================================================================
// ANALYTICS
// ======================================================================
app.get('/api/analytics', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const totalWatched = db.prepare("SELECT COALESCE(SUM(episodesWatched),0) as t FROM watch_history WHERE userId = ?").get(userId).t;
  const totalMinutes = db.prepare("SELECT COALESCE(SUM(minutesWatched),0) as t FROM watch_history WHERE userId = ?").get(userId).t;
  const totalShows = db.prepare("SELECT COUNT(*) as c FROM watchlist WHERE userId = ?").get(userId).c;
  const completed = db.prepare("SELECT COUNT(*) as c FROM watchlist WHERE userId = ? AND status = 'Completed'").get(userId).c;
  const watching = db.prepare("SELECT COUNT(*) as c FROM watchlist WHERE userId = ? AND status = 'Watching'").get(userId).c;
  const onHold = db.prepare("SELECT COUNT(*) as c FROM watchlist WHERE userId = ? AND status = 'On Hold'").get(userId).c;
  const dropped = db.prepare("SELECT COUNT(*) as c FROM watchlist WHERE userId = ? AND status = 'Dropped'").get(userId).c;
  const planToWatch = db.prepare("SELECT COUNT(*) as c FROM watchlist WHERE userId = ? AND status = 'Plan to Watch'").get(userId).c;

  const daily = db.prepare("SELECT logDate, SUM(minutesWatched) as minutes, SUM(episodesWatched) as episodes FROM watch_history WHERE userId = ? GROUP BY logDate ORDER BY logDate DESC LIMIT 14").all(userId);

  const genreStats = db.prepare(`SELECT s.genre, COUNT(*) as count FROM watchlist w JOIN shows s ON w.showId = s.id WHERE w.userId = ? AND w.status IN ('Watching','Completed') GROUP BY s.genre ORDER BY count DESC`).all(userId);

  const topShows = db.prepare(`SELECT s.title, w.watchedEpisodes, w.status, w.rating FROM watchlist w JOIN shows s ON w.showId = s.id WHERE w.userId = ? ORDER BY w.watchedEpisodes DESC LIMIT 5`).all(userId);

  res.json({ totalWatched, totalMinutes, totalShows, statusBreakdown: { Watching: watching, Completed: completed, 'On Hold': onHold, Dropped: dropped, 'Plan to Watch': planToWatch }, daily, genreStats, topShows });
});

// ======================================================================
// WATCHLIST SHARING
// ======================================================================
app.get('/api/share/:token', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE shareToken = ?').get(req.params.token);
  if (!user) return res.status(404).json({ error: 'Share link not found' });
  const list = db.prepare(`SELECT w.*, s.title, s.genre, s.tags, s.totalEpisodes, s.streamingLinks FROM watchlist w JOIN shows s ON w.showId = s.id WHERE w.userId = ? ORDER BY w.updatedAt DESC`).all(user.id);
  res.json({ user: { name: user.name }, watchlist: list.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]'), streamingLinks: JSON.parse(r.streamingLinks || '[]') })) });
});

app.get('/api/profile', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare('SELECT id, name, email, role, theme, shareToken, createdAt FROM users WHERE id = ?').get(userId);
  res.json(user);
});

// ======================================================================
// ADMIN
// ======================================================================
app.get('/api/admin/stats', (req, res) => {
  const totalShows = db.prepare('SELECT COUNT(*) as c FROM shows').get().c;
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalClubs = db.prepare('SELECT COUNT(*) as c FROM clubs').get().c;
  const totalPosts = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
  const totalWatchlistEntries = db.prepare('SELECT COUNT(*) as c FROM watchlist').get().c;
  const totalReminders = db.prepare('SELECT COUNT(*) as c FROM reminders').get().c;
  res.json({ totalShows, totalUsers, totalClubs, totalPosts, totalWatchlistEntries, totalReminders });
});

app.get('/api/admin/users', (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, createdAt FROM users').all();
  res.json(users);
});

app.delete('/api/admin/users/:id', (req, res) => {
  if (req.params.id == 1) return res.status(403).json({ error: 'Cannot delete demo user' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/posts', (req, res) => {
  const posts = db.prepare(`SELECT p.*, u.name as userName, c.name as clubName FROM posts p LEFT JOIN users u ON p.userId = u.id LEFT JOIN clubs c ON p.clubId = c.id ORDER BY p.createdAt DESC`).all();
  res.json(posts.map(p => ({ ...p, spoiler: !!p.spoiler })));
});

app.delete('/api/admin/posts/:id', (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ======================================================================
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`AnimeTrack server → http://localhost:${port}`));
