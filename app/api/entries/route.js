import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DB_PATH = path.join(process.cwd(), 'data', 'diary-pages.json');
const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '👏', '✨', '🙏']);

async function ensureDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ entries: [] }, null, 2), 'utf8');
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{"entries":[]}');
  return Array.isArray(parsed.entries) ? parsed : { entries: [] };
}

async function writeDb(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeReactions(entry) {
  if (!entry.reactions || typeof entry.reactions !== 'object') {
    entry.reactions = {};
  }

  for (const key of Object.keys(entry.reactions)) {
    if (!Array.isArray(entry.reactions[key])) {
      delete entry.reactions[key];
      continue;
    }
    entry.reactions[key] = entry.reactions[key].map((name) => String(name).trim()).filter(Boolean);
  }
}

export async function GET() {
  const db = await readDb();
  db.entries.forEach(normalizeReactions);
  const entries = db.entries
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return Response.json({ entries });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const date = String(body.date || '').trim();
  const title = String(body.title || '').trim();
  const entryBody = String(body.body || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: '日付は YYYY-MM-DD 形式で入力してください。' }, { status: 400 });
  }

  if (!entryBody) {
    return Response.json({ error: '本文は必須です。' }, { status: 400 });
  }

  const db = await readDb();
  if (db.entries.some((entry) => entry.date === date)) {
    return Response.json({ error: '同じ日付のページはすでに存在します。' }, { status: 409 });
  }

  const entry = {
    id: crypto.randomUUID(),
    date,
    title,
    body: entryBody,
    createdAt: new Date().toISOString(),
    reactions: {}
  };

  db.entries.push(entry);
  await writeDb(db);

  return Response.json({ entry }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const entryId = String(body.entryId || '').trim();
  const emoji = String(body.emoji || '').trim();
  const actor = String(body.actor || '').trim();

  if (!entryId) {
    return Response.json({ error: 'entryId が必要です。' }, { status: 400 });
  }
  if (!ALLOWED_REACTIONS.has(emoji)) {
    return Response.json({ error: '不正なリアクションです。' }, { status: 400 });
  }
  if (!actor) {
    return Response.json({ error: 'ニックネームを入力してください。' }, { status: 400 });
  }

  const db = await readDb();
  const entry = db.entries.find((item) => item.id === entryId);
  if (!entry) {
    return Response.json({ error: '対象ページが見つかりません。' }, { status: 404 });
  }

  normalizeReactions(entry);
  const users = Array.isArray(entry.reactions[emoji]) ? entry.reactions[emoji] : [];
  const index = users.indexOf(actor);
  if (index >= 0) {
    users.splice(index, 1);
  } else {
    users.push(actor);
  }

  if (users.length === 0) {
    delete entry.reactions[emoji];
  } else {
    entry.reactions[emoji] = users;
  }

  await writeDb(db);
  return Response.json({ entryId: entry.id, reactions: entry.reactions });
}
