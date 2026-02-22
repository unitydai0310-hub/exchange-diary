import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN が未設定です' },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const filename = (url.searchParams.get('filename') || 'upload.bin').trim();
  const contentType = request.headers.get('content-type') || 'application/octet-stream';

  if (!request.body) {
    return NextResponse.json({ error: 'ファイルデータがありません' }, { status: 400 });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  const blob = await put(`uploads/${Date.now()}-${safeName}`, request.body, {
    access: 'public',
    contentType,
    addRandomSuffix: true
  });

  return NextResponse.json({
    url: blob.url,
    name: filename,
    type: contentType
  });
}
