import { NextResponse } from 'next/server';
import { createToken } from '../../_lib/auth.js';
import { MAX_ROOM_MEMBERS } from '../../_lib/constants.js';
import { normalizeNickname, normalizeRoom, normalizeRoomCode } from '../../_lib/rooms.js';
import { getRoom, saveRoom } from '../../_lib/store.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const nickname = normalizeNickname(body.nickname);
    const roomCode = normalizeRoomCode(body.roomCode);

    if (!nickname || !roomCode) {
      return NextResponse.json(
        { error: 'ニックネームとルームコードを入力してください' },
        { status: 400 }
      );
    }

    const rawRoom = await getRoom(roomCode);
    if (!rawRoom) {
      return NextResponse.json({ error: 'ルームが見つかりません' }, { status: 404 });
    }

    const room = normalizeRoom(rawRoom, roomCode);

    if (!room.members.includes(nickname) && room.members.length >= MAX_ROOM_MEMBERS) {
      return NextResponse.json({ error: 'このルームは30名まで参加できます' }, { status: 409 });
    }

    if (!room.members.includes(nickname)) {
      room.members.push(nickname);
      await saveRoom(roomCode, room);
    }

    const token = createToken(roomCode, nickname);
    return NextResponse.json({
      token,
      roomCode,
      roomName: room.name,
      nickname,
      inviteUrl: `/?room=${roomCode}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
