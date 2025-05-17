const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const db = new sqlite3.Database('./database.db');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: true
}));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Konfiguracja multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

// Tworzenie tabel, jeśli nie istnieją
db.serialize(() => {
  db.run(\`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      bio TEXT DEFAULT '',
      avatar TEXT DEFAULT ''
    )
  \`);
  db.run(\`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      filename TEXT,
      cover TEXT,
      user_id INTEGER
    )
  \`);
  db.run(\`
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      song_id INTEGER,
      rating INTEGER,
      comment TEXT
    )
  \`);
});

// Rejestracja
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  const hashed = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashed], function(err) {
    if (err) return res.status(500).send('Użytkownik już istnieje');
    req.session.userId = this.lastID;
    res.redirect('/');
  });
});

// Logowanie
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).send('Nieprawidłowe dane logowania');
    }
    req.session.userId = user.id;
    res.redirect('/');
  });
});

// Dodawanie piosenki
app.post('/api/songs', upload.fields([{ name: 'audio' }, { name: 'cover' }]), (req, res) => {
  if (!req.session.userId) return res.status(401).send('Zaloguj się');
  const { title } = req.body;
  const audio = req.files['audio']?.[0];
  const cover = req.files['cover']?.[0];
  if (!audio || !cover) return res.status(400).send('Brakuje pliku');
  db.run('INSERT INTO songs (title, filename, cover, user_id) VALUES (?, ?, ?, ?)',
    [title, audio.filename, cover.filename, req.session.userId],
    () => res.redirect('/')
  );
});

// Pobieranie piosenek
app.get('/api/songs', (req, res) => {
  db.all('SELECT * FROM songs ORDER BY id DESC', (err, rows) => {
    res.json(rows);
  });
});

// Ocenianie
app.post('/api/songs/:id/rate', (req, res) => {
  if (!req.session.userId) return res.status(401).send('Zaloguj się');
  const song_id = req.params.id;
  const { rating, comment } = req.body;
  db.run('INSERT INTO ratings (user_id, song_id, rating, comment) VALUES (?, ?, ?, ?)',
    [req.session.userId, song_id, rating, comment], () => res.redirect('/')
  );
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serwer działa na porcie', PORT));