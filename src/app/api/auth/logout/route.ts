import { NextRequest, NextResponse } from 'next/server';
import { revokeSession } from '@/lib/cloud/cloudDb';

export async function POST(req: NextRequest) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.cookies.get('worshipy_token')?.value;

  if (token) {
    revokeSession(token);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('worshipy_token');
  return response;
}
