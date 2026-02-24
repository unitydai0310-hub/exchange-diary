import { NextResponse } from 'next/server';
import { authFromRequest } from '../../../../../_lib/auth.js';
import { newEntryId, normalizeEntryComments, normalizeRoom, normalizeRoomCode } from '../../../../../_lib/rooms.js';
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
    const entry = room.entries.find((item) => item.id === entryId);
    if (!entry) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const commentBody = String(body.body || '').trim();
    if (!commentBody) {
      return NextResponse.json({ error: 'コメント本文を入力してください' }, { status: 400 });
    }
    if (commentBody.length > 300) {
      return NextResponse.json({ error: 'コメントは300文字以内で入力してください' }, { status: 400 });
    }

    normalizeEntryComments(entry);
    const comment = {
      id: newEntryId(),
      author: session.nickname,
      body: commentBody,
      createdAt: new Date().toISOString()
    };
    entry.comments.push(comment);

    await saveRoom(roomCode, room);
    return NextResponse.json({ entryId: entry.id, comment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
