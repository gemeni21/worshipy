import { NextRequest, NextResponse } from 'next/server';
import { loginOrRegisterWithGoogle } from '@/lib/cloud/cloudDb';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, displayName, photoURL, emailVerified, churchName, instrument } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    const { user, token } = loginOrRegisterWithGoogle({
      email,
      displayName,
      photoURL,
      emailVerified: Boolean(emailVerified),
      churchName,
      instrument,
    });

    const res = NextResponse.json({ user, token });
    res.cookies.set('worshipy_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google authentication failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
