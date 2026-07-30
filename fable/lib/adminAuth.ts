import crypto from 'crypto';

export const ADMIN_SESSION_COOKIE = 'fable_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Session token = "<expiresAtMs>.<hmac>" — no password material stored client-side.
export function createAdminSessionToken(): string | null {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return null;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sig = sign(String(expiresAt), secret);
  return `${expiresAt}.${sig}`;
}

export function verifyAdminSessionToken(token: string | undefined | null): boolean {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || !token) return false;

  const [expiresAtStr, sig] = token.split('.');
  if (!expiresAtStr || !sig) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expectedSig = sign(expiresAtStr, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}
