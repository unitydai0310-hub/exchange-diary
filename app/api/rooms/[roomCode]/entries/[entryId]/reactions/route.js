import { NextResponse } from 'next/server';
import { authFromRequest } from '../../../../../_lib/auth.js';
import { ALLOWED_REACTIONS } from '../../../../../_lib/constants.js';
import { normalizeEntryReactions, normalizeRoom, normalizeRoomCode } from '../../../../../_lib/rooms.js';
import { getRoom, saveRoom } from '../../../../../_lib/store.js';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const roomCode = normalizeRoomCode(params.roomCode);
    const entryId = String(params.entryId || '').trim();
    const session = authFromRequest(request, roomCode);
    if (!session) {
      return NextResponse.json({ error: '認証情報が無効です' }, { status: 401 });
    }

    const rawRoom = await getRoom(roomCode);
    if (!rawRoom) {
      return NextResponse.json({ error: 'ルームが見つかりません' }, { status: 404 });
    }

    const room = normalizeRoom(rawRoom, roomCode);
    const body = await request.json().catch(() => ({}));
    const emoji = String(body.emoji || '').trim();

    if (!ALLOWED_REACTIONS.includes(emoji)) {
      return NextResponse.json({ error: '不正なリアクションです' }, { status: 400 });
    }

    const entry = room.entries.find((item) => item.id === entryId);
    if (!entry) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 });
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

    await saveRoom(roomCode, room);
    return NextResponse.json({ entryId: entry.id, reactions: entry.reactions });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
