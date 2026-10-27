import { NextRequest, NextResponse } from 'next/server';
import { validateSessionToken } from '@/lib/cloud/cloudDb';

export async function GET(req: NextRequest) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.cookies.get('worshipy_token')?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  const profile = validateSessionToken(token);
  return NextResponse.json({ user: profile });
}
