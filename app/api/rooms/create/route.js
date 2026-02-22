import { NextResponse } from 'next/server';
import { createToken } from '../../_lib/auth.js';
import { MAX_ROOM_MEMBERS } from '../../_lib/constants.js';
import { makeRoomCode, normalizeNickname, normalizeRoom } from '../../_lib/rooms.js';
import { roomExists, saveRoom } from '../../_lib/store.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const nickname = normalizeNickname(body.nickname);
    const roomName = String(body.roomName || '').trim() || '交換日記ルーム';

    if (!nickname) {
      return NextResponse.json({ error: 'ニックネームは必須です' }, { status: 400 });
    }

    let roomCode = makeRoomCode();
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await roomExists(roomCode))) break;
      roomCode = makeRoomCode();
    }

    const room = normalizeRoom(
      {
        code: roomCode,
        name: roomName,
        createdAt: new Date().toISOString(),
        members: [nickname],
        entries: [],
        lotteryAssignments: {}
      },
      roomCode
    );

    if (room.members.length > MAX_ROOM_MEMBERS) {
      room.members = room.members.slice(0, MAX_ROOM_MEMBERS);
    }

    await saveRoom(roomCode, room);

    const token = createToken(roomCode, nickname);
    return NextResponse.json(
      {
        token,
        roomCode,
        roomName: room.name,
        nickname,
        inviteUrl: `/?room=${roomCode}`
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
