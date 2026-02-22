import { promises as fs } from 'node:fs';
import path from 'node:path';

const DB_PATH = path.join(process.cwd(), 'data', 'rooms.vercel.json');

function getKvEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return { url, token };
}

function hasKv() {
  const { url, token } = getKvEnv();
  return Boolean(url && token);
}

async function kvGet(key) {
  const { url, token } = getKvEnv();
  process.env.KV_REST_API_URL = url;
  process.env.KV_REST_API_TOKEN = token;
  const { kv } = await import('@vercel/kv');
  return kv.get(key);
}

async function kvSet(key, value) {
  const { url, token } = getKvEnv();
  process.env.KV_REST_API_URL = url;
  process.env.KV_REST_API_TOKEN = token;
  const { kv } = await import('@vercel/kv');
  await kv.set(key, value);
}

function assertStorageReady() {
  if (process.env.VERCEL && !hasKv()) {
    throw new Error(
      'Vercel KV が未設定です。Vercel StorageでKVを接続して再デプロイしてください。'
    );
  }
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
  assertStorageReady();
  if (hasKv()) {
    const room = await kvGet(`room:${roomCode}`);
    return room || null;
  }

  const db = await readFileDb();
  return db.rooms[roomCode] || null;
}

export async function saveRoom(roomCode, room) {
  assertStorageReady();
  if (hasKv()) {
    await kvSet(`room:${roomCode}`, room);
    return;
  }

  const db = await readFileDb();
  db.rooms[roomCode] = room;
  await writeFileDb(db);
}

export async function roomExists(roomCode) {
  assertStorageReady();
  const room = await getRoom(roomCode);
  return Boolean(room);
}
