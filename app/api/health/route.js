import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString()
  });
}
