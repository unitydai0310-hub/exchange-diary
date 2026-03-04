import { NextResponse } from 'next/server';
import { authFromRequest } from '../../../_lib/auth.js';
import { normalizeNickname, normalizeRoom, normalizeRoomCode } from '../../../_lib/rooms.js';
import { getRoom, saveRoom } from '../../../_lib/store.js';

export const runtime = 'nodejs';

async function loadAuthorizedHostRoom(request, params) {
  const roomCode = normalizeRoomCode(params.roomCode);
  const session = authFromRequest(request, roomCode);
  if (!session) {
    return { error: NextResponse.json({ error: '認証情報が無効です' }, { status: 401 }) };
  }

  const rawRoom = await getRoom(roomCode);
  if (!rawRoom) {
    return { error: NextResponse.json({ error: 'ルームが見つかりません' }, { status: 404 }) };
  }

  const room = normalizeRoom(rawRoom, roomCode);
  if (!Array.isArray(room.members) || !room.members.includes(normalizeNickname(session.nickname))) {
    return { error: NextResponse.json({ error: 'このルームのメンバーではありません' }, { status: 403 }) };
  }
  if (!room.hostNickname || session.nickname !== room.hostNickname) {
    return { error: NextResponse.json({ error: 'ホストのみ実行できます' }, { status: 403 }) };
  }

  return { roomCode, room, session };
}

export async function DELETE(request, { params }) {
  try {
    const result = await loadAuthorizedHostRoom(request, params);
    if (result.error) return result.error;

    const { roomCode, room } = result;

    const body = await request.json().catch(() => ({}));
    const targetNickname = normalizeNickname(body.nickname || '');
    if (!targetNickname) {
      return NextResponse.json({ error: '削除対象のニックネームが必要です' }, { status: 400 });
    }
    if (targetNickname === room.hostNickname) {
      return NextResponse.json({ error: 'ホストは削除できません' }, { status: 400 });
    }
    if (!room.members.includes(targetNickname)) {
      return NextResponse.json({ error: '指定メンバーが見つかりません' }, { status: 404 });
    }

    room.members = room.members.filter((name) => name !== targetNickname);

    if (room.pushSubscriptions && typeof room.pushSubscriptions === 'object') {
      delete room.pushSubscriptions[targetNickname];
    }

    if (room.lotteryAssignments && typeof room.lotteryAssignments === 'object') {
      for (const date of Object.keys(room.lotteryAssignments)) {
        const assignment = room.lotteryAssignments[date];
        const winners = Array.isArray(assignment?.winners) ? assignment.winners : [];
        const filtered = winners.filter((name) => name !== targetNickname);
        if (filtered.length === 0) {
          delete room.lotteryAssignments[date];
        } else {
          room.lotteryAssignments[date] = {
            ...assignment,
            winners: filtered
          };
        }
      }
    }

    await saveRoom(roomCode, room);
    return NextResponse.json({ ok: true, members: room.members, removed: targetNickname });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const result = await loadAuthorizedHostRoom(request, params);
    if (result.error) return result.error;

    const { roomCode, room } = result;

    const body = await request.json().catch(() => ({}));
    const targetNickname = normalizeNickname(body.nickname || '');
    if (!targetNickname) {
      return NextResponse.json({ error: '譲渡先のニックネームが必要です' }, { status: 400 });
    }
    if (targetNickname === room.hostNickname) {
      return NextResponse.json({ error: 'すでにホストです' }, { status: 400 });
    }
    if (!room.members.includes(targetNickname)) {
      return NextResponse.json({ error: '指定メンバーが見つかりません' }, { status: 404 });
    }

    room.hostNickname = targetNickname;
    await saveRoom(roomCode, room);

    return NextResponse.json({ ok: true, hostNickname: room.hostNickname, members: room.members });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
