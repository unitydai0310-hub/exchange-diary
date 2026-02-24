import { NextResponse } from 'next/server';
import { getPublicVapidKey } from '../../_lib/push.js';

export const runtime = 'nodejs';

export function GET() {
  const publicKey = getPublicVapidKey();
  if (!publicKey) {
    return NextResponse.json({ error: 'VAPID_PUBLIC_KEY が未設定です' }, { status: 500 });
  }
  return NextResponse.json({ publicKey });
}
