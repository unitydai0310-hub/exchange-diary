import { NextResponse } from 'next/server';
import { authFromRequest } from '../../_lib/auth.js';
import { normalizeEntryReactions, normalizeRoom, normalizeRoomCode } from '../../_lib/rooms.js';
import { getRoom } from '../../_lib/store.js';

export const runtime = 'nodejs';

function toPublicEntry(entry) {
  normalizeEntryReactions(entry);
  return {
    id: entry.id,
    roomCode: entry.roomCode,
    author: entry.author,
    body: entry.body,
    date: entry.date,
    createdAt: entry.createdAt,
    media: Array.isArray(entry.media) ? entry.media : [],
    reactions: entry.reactions || {}
  };
}

export async function GET(request, { params }) {
  try {
    const roomCode = normalizeRoomCode(params.roomCode);
    const session = authFromRequest(request, roomCode);
    if (!session) {
      return NextResponse.json({ error: '認証情報が無効です' }, { status: 401 });
    }

    const rawRoom = await getRoom(roomCode);
    if (!rawRoom) {
      return NextResponse.json({ error: 'ルームが見つかりません' }, { status: 404 });
    }

    const room = normalizeRoom(rawRoom, roomCode);
    const entries = room.entries
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map(toPublicEntry);

    return NextResponse.json({
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
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
