import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/lib/cloud/cloudDb';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, displayName, churchName, instrument } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const { profile, token } = registerUser({
      email,
      password,
      displayName: displayName || email.split('@')[0],
      churchName,
      instrument,
    });

    const response = NextResponse.json({ profile, token });
    // Set HTTP-only cookie for web clients
    response.cookies.set('worshipy_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration failed.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
