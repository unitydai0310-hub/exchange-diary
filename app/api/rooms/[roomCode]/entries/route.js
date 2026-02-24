import { NextResponse } from 'next/server';
import { authFromRequest } from '../../../_lib/auth.js';
import { MAX_MEDIA_PER_POST } from '../../../_lib/constants.js';
import { notifyNewEntry } from '../../../_lib/push.js';
import { newEntryId, normalizeRoom, normalizeRoomCode } from '../../../_lib/rooms.js';
import { getRoom, saveRoom } from '../../../_lib/store.js';

export const runtime = 'nodejs';

function isDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '').trim());
}

export async function POST(request, { params }) {
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
    const body = await request.json().catch(() => ({}));
    const date = String(body.date || '').trim();
    const entryBody = String(body.body || '').trim();
    const media = Array.isArray(body.media) ? body.media.slice(0, MAX_MEDIA_PER_POST) : [];

    if (!isDateKey(date)) {
      return NextResponse.json(
        { error: '日付は YYYY-MM-DD 形式で入力してください' },
        { status: 400 }
      );
    }

    const assignment = room.lotteryAssignments?.[date];
    const winners = Array.isArray(assignment?.winners)
      ? assignment.winners
      : assignment?.winner
        ? [assignment.winner]
        : [];

    if (winners.length > 0 && !winners.includes(session.nickname)) {
      return NextResponse.json(
        { error: `${date} の担当は ${winners.join(' / ')} さんです` },
        { status: 403 }
      );
    }

    if (!entryBody && media.length === 0) {
      return NextResponse.json(
        { error: '本文または画像/動画を1つ以上入力してください' },
        { status: 400 }
      );
    }

    const already = room.entries.find((entry) => entry.date === date && entry.author === session.nickname);
    if (already) {
      return NextResponse.json({ error: '同じ日付には1人1件までです' }, { status: 409 });
    }

    const safeMedia = media
      .map((item) => ({
        name: String(item?.name || 'file'),
        type: String(item?.type || 'application/octet-stream'),
        url: String(item?.url || '').trim()
      }))
      .filter((item) => item.url);

    const entry = {
      id: newEntryId(),
      roomCode,
      author: session.nickname,
      date,
      body: entryBody,
      createdAt: new Date().toISOString(),
      media: safeMedia,
      reactions: {}
    };

    room.entries.push(entry);
    await saveRoom(roomCode, room);
    await notifyNewEntry(room, entry);

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
