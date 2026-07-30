import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '../../../../lib/adminAuth';

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json({ error: 'Admin dashboard is not configured (ADMIN_PASSWORD unset)' }, { status: 500 });
  }

  const { password } = await req.json() as { password?: string };
  const suppliedBuf = Buffer.from(password || '');
  const expectedBuf = Buffer.from(adminPassword);

  const matches = suppliedBuf.length === expectedBuf.length && crypto.timingSafeEqual(suppliedBuf, expectedBuf);
  if (!matches) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const token = createAdminSessionToken()!;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
