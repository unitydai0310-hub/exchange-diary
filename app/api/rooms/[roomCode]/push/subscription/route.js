import { NextResponse } from 'next/server';
import { authFromRequest } from '../../../../_lib/auth.js';
import { normalizeRoom, normalizeRoomCode } from '../../../../_lib/rooms.js';
import { getRoom, saveRoom } from '../../../../_lib/store.js';

export const runtime = 'nodejs';

function normalizeSubscription(input) {
  if (!input || typeof input !== 'object') return null;
  const endpoint = String(input.endpoint || '').trim();
  const p256dh = String(input.keys?.p256dh || '').trim();
  const auth = String(input.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    expirationTime: input.expirationTime ?? null,
    keys: { p256dh, auth }
  };
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
    const subscription = normalizeSubscription(body.subscription);

    if (!subscription) {
      return NextResponse.json({ error: '購読情報が不正です' }, { status: 400 });
    }

    const current = Array.isArray(room.pushSubscriptions[session.nickname])
      ? room.pushSubscriptions[session.nickname]
      : [];

    const merged = [subscription, ...current.filter((item) => item.endpoint !== subscription.endpoint)];
    room.pushSubscriptions[session.nickname] = merged;

    await saveRoom(roomCode, room);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
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
    const endpoint = String(body.endpoint || '').trim();

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint が必要です' }, { status: 400 });
    }

    const current = Array.isArray(room.pushSubscriptions[session.nickname])
      ? room.pushSubscriptions[session.nickname]
      : [];

    room.pushSubscriptions[session.nickname] = current.filter((item) => item.endpoint !== endpoint);
    if (room.pushSubscriptions[session.nickname].length === 0) {
      delete room.pushSubscriptions[session.nickname];
    }

    await saveRoom(roomCode, room);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
