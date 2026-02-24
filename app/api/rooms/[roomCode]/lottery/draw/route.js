import { NextResponse } from 'next/server';
import { authFromRequest } from '../../../../_lib/auth.js';
import { notifyLotteryWinners } from '../../../../_lib/push.js';
import { getTomorrowDateKey, isDateKey, normalizeRoom, normalizeRoomCode, pickWinners } from '../../../../_lib/rooms.js';
import { getRoom, saveRoom } from '../../../../_lib/store.js';

export const runtime = 'nodejs';

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
    if (!Array.isArray(room.members) || room.members.length === 0) {
      return NextResponse.json({ error: '抽選対象メンバーがいません' }, { status: 409 });
    }
    if (!room.hostNickname || session.nickname !== room.hostNickname) {
      return NextResponse.json({ error: '抽選はホストのみ実行できます' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedDate = String(body.date || '').trim();
    const date = isDateKey(requestedDate) ? requestedDate : getTomorrowDateKey();

    const existing = room.lotteryAssignments[date];
    if (existing?.winners?.length) {
      return NextResponse.json({ error: `${date} の抽選はすでに実施済みです` }, { status: 409 });
    }

    const assignment = {
      winners: pickWinners(room.members),
      drawnBy: session.nickname,
      drawnAt: new Date().toISOString()
    };

    room.lotteryAssignments[date] = assignment;
    await saveRoom(roomCode, room);
    await notifyLotteryWinners(room, date, assignment.winners);

    return NextResponse.json({ assignment: { date, ...assignment }, reused: false }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
