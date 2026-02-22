import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromB64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function createToken(roomCode, nickname) {
  const payload = b64url(
    JSON.stringify({
      roomCode,
      nickname,
      iat: Date.now()
    })
  );
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (sign(payload) !== sig) return null;

  try {
    const parsed = JSON.parse(fromB64url(payload));
    if (!parsed?.roomCode || !parsed?.nickname) return null;
    return {
      roomCode: String(parsed.roomCode),
      nickname: String(parsed.nickname)
    };
  } catch {
    return null;
  }
}

export function authFromRequest(request, roomCode) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const session = verifyToken(token);
  if (!session) return null;
  if (roomCode && session.roomCode !== roomCode) return null;
  return session;
}
