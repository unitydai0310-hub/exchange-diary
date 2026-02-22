import { promises as fs } from 'node:fs';
import path from 'node:path';
import { kv } from '@vercel/kv';

const DB_PATH = path.join(process.cwd(), 'data', 'rooms.vercel.json');

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function ensureFileDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ rooms: {} }, null, 2), 'utf8');
  }
}

async function readFileDb() {
  await ensureFileDb();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{"rooms":{}}');
  if (!parsed.rooms || typeof parsed.rooms !== 'object') {
    return { rooms: {} };
  }
  return parsed;
}

async function writeFileDb(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export async function getRoom(roomCode) {
  if (hasKv()) {
    const room = await kv.get(`room:${roomCode}`);
    return room || null;
  }

  const db = await readFileDb();
  return db.rooms[roomCode] || null;
}

export async function saveRoom(roomCode, room) {
  if (hasKv()) {
    await kv.set(`room:${roomCode}`, room);
    return;
  }

  const db = await readFileDb();
  db.rooms[roomCode] = room;
  await writeFileDb(db);
}

export async function roomExists(roomCode) {
  const room = await getRoom(roomCode);
  return Boolean(room);
}
