import { NextRequest, NextResponse } from 'next/server';
import { verifyUserLogin } from '@/lib/cloud/cloudDb';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const { profile, token } = verifyUserLogin(email, password);

    const response = NextResponse.json({ profile, token });
    response.cookies.set('worshipy_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid credentials.';
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
