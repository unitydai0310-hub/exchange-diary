const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5173;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(ROOT, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'rooms.json');
const MAX_BODY = 35 * 1024 * 1024;
const MAX_MEDIA_PER_POST = 3;
const MAX_ROOM_MEMBERS = 30;
const DAILY_WINNER_COUNT = 3;
const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '👏', '✨', '🙏']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
};

const sessions = new Map();
const streamsByRoom = new Map();

ensureDir(DATA_DIR);
ensureDir(UPLOADS_DIR);

const db = loadDb();

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    const seed = { rooms: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }

  const text = fs.readFileSync(DB_PATH, 'utf8');
  if (!text.trim()) {
    return { rooms: {} };
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed.rooms || typeof parsed.rooms !== 'object') {
      return { rooms: {} };
    }
    for (const roomCode of Object.keys(parsed.rooms)) {
      normalizeRoom(parsed.rooms[roomCode], roomCode);
    }
    return parsed;
  } catch {
    return { rooms: {} };
  }
}

function saveDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function json(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
}

function send404(res) {
  json(res, 404, { error: 'Not Found' });
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function normalizeNickname(nickname) {
  return String(nickname || '').trim();
}

function normalizeDateKey(dateKey) {
  return String(dateKey || '').trim();
}

function isDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

function getTomorrowDateKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeRoom(room, roomCode) {
  if (!room || typeof room !== 'object') return;
  room.code = room.code || roomCode;
  room.name = room.name || '交換日記ルーム';
  room.createdAt = room.createdAt || new Date().toISOString();
  room.members = Array.isArray(room.members) ? room.members : [];
  room.entries = Array.isArray(room.entries) ? room.entries : [];

  if (!room.lotteryAssignments || typeof room.lotteryAssignments !== 'object') {
    room.lotteryAssignments = {};
  }

  for (const date of Object.keys(room.lotteryAssignments)) {
    if (!isDateKey(date)) {
      delete room.lotteryAssignments[date];
      continue;
    }
    const item = room.lotteryAssignments[date];
    if (!item || typeof item !== 'object') {
      delete room.lotteryAssignments[date];
      continue;
    }
    const winnersSource = Array.isArray(item.winners) ? item.winners : [item.winner];
    const winners = winnersSource
      .map((name) => normalizeNickname(name))
      .filter(Boolean)
      .filter((name, idx, arr) => arr.indexOf(name) === idx);

    if (winners.length === 0) {
      delete room.lotteryAssignments[date];
      continue;
    }
    room.lotteryAssignments[date] = {
      winners,
      drawnBy: normalizeNickname(item.drawnBy),
      drawnAt: item.drawnAt || new Date().toISOString()
    };
  }
}

function pickWinners(members, count) {
  const pool = members.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, Math.min(count, pool.length)));
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function collectJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });

    req.on('error', () => reject(new Error('READ_ERROR')));
  });
}

function getSession(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return sessions.get(token) || null;
}

function getSessionFromToken(token) {
  if (!token) return null;
  return sessions.get(String(token).trim()) || null;
}

function requireSession(req, res, roomCode) {
  const session = getSession(req);
  if (!session || session.roomCode !== roomCode) {
    json(res, 401, { error: '認証情報が無効です' });
    return null;
  }
  return session;
}

function withRoom(roomCode, res) {
  const room = db.rooms[roomCode];
  if (!room) {
    json(res, 404, { error: 'ルームが見つかりません' });
    return null;
  }
  normalizeRoom(room, roomCode);
  return room;
}

function normalizeEntryReactions(entry) {
  if (!entry.reactions || typeof entry.reactions !== 'object') {
    entry.reactions = {};
  }

  for (const key of Object.keys(entry.reactions)) {
    if (!Array.isArray(entry.reactions[key])) {
      delete entry.reactions[key];
    }
  }
}

function toPublicEntry(entry) {
  normalizeEntryReactions(entry);
  return {
    id: entry.id,
    roomCode: entry.roomCode,
    author: entry.author,
    body: entry.body,
    date: entry.date,
    createdAt: entry.createdAt,
    media: entry.media || [],
    reactions: entry.reactions || {}
  };
}

function writeSse(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastRoom(roomCode, eventName, payload) {
  const listeners = streamsByRoom.get(roomCode);
  if (!listeners || listeners.size === 0) return;
  for (const res of listeners) {
    writeSse(res, eventName, payload);
  }
}

function sanitizeExt(filename, mimeType) {
  const extFromName = path.extname(filename || '').toLowerCase();
  const allowed = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.webm']);
  if (allowed.has(extFromName)) return extFromName;

  if (mimeType.startsWith('image/')) return '.jpg';
  if (mimeType.startsWith('video/')) return '.mp4';
  return '.bin';
}

function saveMediaFiles(roomCode, medias) {
  if (!Array.isArray(medias) || medias.length === 0) {
    return [];
  }

  const trimmed = medias.slice(0, MAX_MEDIA_PER_POST);
  const roomDir = path.join(UPLOADS_DIR, roomCode);
  ensureDir(roomDir);

  return trimmed.map((media) => {
    const mimeType = String(media.type || 'application/octet-stream');
    const fileName = String(media.name || 'upload');
    const b64 = String(media.base64 || '');
    const ext = sanitizeExt(fileName, mimeType);
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const target = path.join(roomDir, id);

    const data = Buffer.from(b64, 'base64');
    fs.writeFileSync(target, data);

    return {
      type: mimeType,
      name: fileName,
      url: `/uploads/${roomCode}/${id}`
    };
  });
}

function handleCreateRoom(req, res) {
  collectJsonBody(req)
    .then((body) => {
      const nickname = normalizeNickname(body.nickname);
      const roomName = String(body.roomName || '').trim() || '交換日記ルーム';

      if (!nickname) {
        json(res, 400, { error: 'ニックネームは必須です' });
        return;
      }

      let roomCode = makeRoomCode();
      while (db.rooms[roomCode]) {
        roomCode = makeRoomCode();
      }

      db.rooms[roomCode] = {
        code: roomCode,
        name: roomName,
        createdAt: new Date().toISOString(),
        members: [nickname],
        entries: [],
        lotteryAssignments: {}
      };
      saveDb();

      const token = makeToken();
      sessions.set(token, { roomCode, nickname });

      json(res, 201, {
        token,
        roomCode,
        roomName,
        nickname,
        inviteUrl: `/?room=${roomCode}`
      });
    })
    .catch((err) => {
      if (err.message === 'BODY_TOO_LARGE') {
        json(res, 413, { error: '送信サイズが大きすぎます' });
        return;
      }
      json(res, 400, { error: 'リクエスト形式が不正です' });
    });
}

function handleJoinRoom(req, res) {
  collectJsonBody(req)
    .then((body) => {
      const nickname = normalizeNickname(body.nickname);
      const roomCode = normalizeRoomCode(body.roomCode);

      if (!nickname || !roomCode) {
        json(res, 400, { error: 'ニックネームとルームコードを入力してください' });
        return;
      }

      const room = db.rooms[roomCode];
      if (!room) {
        json(res, 404, { error: 'ルームが見つかりません' });
        return;
      }

      if (!room.members.includes(nickname) && room.members.length >= MAX_ROOM_MEMBERS) {
        json(res, 409, { error: 'このルームは30名まで参加できます' });
        return;
      }

      if (!room.members.includes(nickname)) {
        room.members.push(nickname);
        saveDb();
      }

      const token = makeToken();
      sessions.set(token, { roomCode, nickname });

      json(res, 200, {
        token,
        roomCode,
        roomName: room.name,
        nickname,
        inviteUrl: `/?room=${roomCode}`
      });
    })
    .catch((err) => {
      if (err.message === 'BODY_TOO_LARGE') {
        json(res, 413, { error: '送信サイズが大きすぎます' });
        return;
      }
      json(res, 400, { error: 'リクエスト形式が不正です' });
    });
}

function handleGetRoom(req, res, roomCode) {
  const session = requireSession(req, res, roomCode);
  if (!session) return;

  const room = withRoom(roomCode, res);
  if (!room) return;

  const entries = room.entries
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(toPublicEntry);

  json(res, 200, {
    room: {
      code: room.code,
      name: room.name,
      members: room.members,
      createdAt: room.createdAt,
      lotteryAssignments: room.lotteryAssignments || {}
    },
    me: session.nickname,
    entries
  });
}

function handleDrawLottery(req, res, roomCode) {
  const session = requireSession(req, res, roomCode);
  if (!session) return;

  const room = withRoom(roomCode, res);
  if (!room) return;

  collectJsonBody(req)
    .then((body) => {
      if (!Array.isArray(room.members) || room.members.length === 0) {
        json(res, 409, { error: '抽選対象メンバーがいません' });
        return;
      }

      const requestedDate = normalizeDateKey(body.date);
      const date = requestedDate && isDateKey(requestedDate) ? requestedDate : getTomorrowDateKey();
      normalizeRoom(room, roomCode);

      const existing = room.lotteryAssignments[date];
      if (existing) {
        json(res, 200, {
          assignment: { date, ...existing },
          reused: true
        });
        return;
      }

      const assignment = {
        winners: pickWinners(room.members, DAILY_WINNER_COUNT),
        drawnBy: session.nickname,
        drawnAt: new Date().toISOString()
      };
      room.lotteryAssignments[date] = assignment;
      saveDb();

      const payload = { date, ...assignment };
      broadcastRoom(roomCode, 'lottery-updated', payload);
      json(res, 201, { assignment: payload, reused: false });
    })
    .catch((err) => {
      if (err.message === 'BODY_TOO_LARGE') {
        json(res, 413, { error: '送信サイズが大きすぎます' });
        return;
      }
      json(res, 400, { error: 'リクエスト形式が不正です' });
    });
}

function handlePostEntry(req, res, roomCode) {
  const session = requireSession(req, res, roomCode);
  if (!session) return;

  const room = withRoom(roomCode, res);
  if (!room) return;

  collectJsonBody(req)
    .then((body) => {
      const date = String(body.date || '').trim();
      const entryBody = String(body.body || '').trim();
      const medias = Array.isArray(body.media) ? body.media : [];

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        json(res, 400, { error: '日付は YYYY-MM-DD 形式で入力してください' });
        return;
      }

      normalizeRoom(room, roomCode);
      const assigned = room.lotteryAssignments[date];
      const winners = Array.isArray(assigned?.winners)
        ? assigned.winners
        : assigned?.winner
          ? [assigned.winner]
          : [];
      if (winners.length > 0 && !winners.includes(session.nickname)) {
        json(res, 403, {
          error: `${date} の担当は ${winners.join(' / ')} さんです`
        });
        return;
      }

      if (!entryBody && medias.length === 0) {
        json(res, 400, { error: '本文または画像/動画を1つ以上入力してください' });
        return;
      }

      const already = room.entries.find(
        (entry) => entry.date === date && entry.author === session.nickname
      );

      if (already) {
        json(res, 409, { error: '同じ日付には1人1件までです' });
        return;
      }

      const savedMedia = saveMediaFiles(roomCode, medias);

      const entry = {
        id: crypto.randomUUID(),
        roomCode,
        author: session.nickname,
        date,
        body: entryBody,
        createdAt: new Date().toISOString(),
        media: savedMedia,
        reactions: {}
      };

      room.entries.push(entry);
      saveDb();

      const payload = toPublicEntry(entry);
      broadcastRoom(roomCode, 'entry-created', payload);
      json(res, 201, { entry: payload });
    })
    .catch((err) => {
      if (err.message === 'BODY_TOO_LARGE') {
        json(res, 413, { error: '送信サイズが大きすぎます' });
        return;
      }
      json(res, 400, { error: 'リクエスト形式が不正です' });
    });
}

function handleToggleReaction(req, res, roomCode, entryId) {
  const session = requireSession(req, res, roomCode);
  if (!session) return;

  const room = withRoom(roomCode, res);
  if (!room) return;

  collectJsonBody(req)
    .then((body) => {
      const emoji = String(body.emoji || '').trim();
      if (!ALLOWED_REACTIONS.has(emoji)) {
        json(res, 400, { error: '不正なリアクションです' });
        return;
      }

      const entry = room.entries.find((item) => item.id === entryId);
      if (!entry) {
        json(res, 404, { error: '投稿が見つかりません' });
        return;
      }

      normalizeEntryReactions(entry);

      const users = Array.isArray(entry.reactions[emoji]) ? entry.reactions[emoji] : [];
      const index = users.indexOf(session.nickname);
      if (index >= 0) {
        users.splice(index, 1);
      } else {
        users.push(session.nickname);
      }

      if (users.length === 0) {
        delete entry.reactions[emoji];
      } else {
        entry.reactions[emoji] = users;
      }

      saveDb();

      const payload = {
        entryId: entry.id,
        reactions: entry.reactions
      };
      broadcastRoom(roomCode, 'reaction-updated', payload);
      json(res, 200, payload);
    })
    .catch((err) => {
      if (err.message === 'BODY_TOO_LARGE') {
        json(res, 413, { error: '送信サイズが大きすぎます' });
        return;
      }
      json(res, 400, { error: 'リクエスト形式が不正です' });
    });
}

function handleStream(req, res, roomCode) {
  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const token = parsed.searchParams.get('token') || '';
  const session = getSessionFromToken(token);

  if (!session || session.roomCode !== roomCode) {
    json(res, 401, { error: '認証情報が無効です' });
    return;
  }

  if (!session) return;

  if (!db.rooms[roomCode]) {
    json(res, 404, { error: 'ルームが見つかりません' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  writeSse(res, 'connected', { ok: true, at: new Date().toISOString() });

  if (!streamsByRoom.has(roomCode)) {
    streamsByRoom.set(roomCode, new Set());
  }
  streamsByRoom.get(roomCode).add(res);

  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = streamsByRoom.get(roomCode);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) {
      streamsByRoom.delete(roomCode);
    }
  });
}

function serveFile(req, res, filePath) {
  if (!filePath.startsWith(ROOT)) {
    send404(res);
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      send404(res);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = Number.parseInt(parts[0], 10);
      const end = parts[1] ? Number.parseInt(parts[1], 10) : stats.size - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stats.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        send404(res);
        return;
      }
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': data.length
      });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      port: Number(PORT),
      host: HOST,
      at: new Date().toISOString()
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/rooms/create') {
    handleCreateRoom(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/rooms/join') {
    handleJoinRoom(req, res);
    return;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})$/);
  if (req.method === 'GET' && roomMatch) {
    handleGetRoom(req, res, roomMatch[1]);
    return;
  }

  const entryMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/entries$/);
  if (req.method === 'POST' && entryMatch) {
    handlePostEntry(req, res, entryMatch[1]);
    return;
  }

  const drawMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/lottery\/draw$/);
  if (req.method === 'POST' && drawMatch) {
    handleDrawLottery(req, res, drawMatch[1]);
    return;
  }

  const reactionMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/entries\/([a-f0-9-]+)\/reactions$/);
  if (req.method === 'POST' && reactionMatch) {
    handleToggleReaction(req, res, reactionMatch[1], reactionMatch[2]);
    return;
  }

  const streamMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/stream$/);
  if (req.method === 'GET' && streamMatch) {
    handleStream(req, res, streamMatch[1]);
    return;
  }

  if (pathname.startsWith('/uploads/')) {
    const target = path.normalize(path.join(ROOT, pathname));
    if (!target.startsWith(UPLOADS_DIR)) {
      send404(res);
      return;
    }
    serveFile(req, res, target);
    return;
  }

  const normalized = pathname === '/' ? '/index.html' : pathname;
  const target = path.normalize(path.join(PUBLIC_DIR, normalized));
  if (!target.startsWith(PUBLIC_DIR)) {
    send404(res);
    return;
  }
  serveFile(req, res, target);
});

server.listen(PORT, HOST, () => {
  console.log(`Exchange Diary running at http://${HOST}:${PORT}`);
});
