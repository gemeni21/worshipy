import { NextRequest, NextResponse } from 'next/server';
import {
  findUserGroup,
  getWorshipGroup,
  validateSessionToken,
} from '@/lib/cloud/cloudDb';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(req: NextRequest) {
  try {
    const token =
      req.headers.get('Authorization')?.replace('Bearer ', '') ||
      req.cookies.get('worshipy_token')?.value;

    if (!token) {
      return NextResponse.json({ group: null, user: null }, { headers: NO_CACHE_HEADERS });
    }

    const user = validateSessionToken(token);
    if (!user) {
      return NextResponse.json({ group: null, user: null }, { headers: NO_CACHE_HEADERS });
    }

    let group = user.groupId ? getWorshipGroup(user.groupId) : null;
    if (!group) {
      group = findUserGroup(user.id, user.email);
    }

    return NextResponse.json({ group: group || null, user }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve user group';
    return NextResponse.json({ error: msg, group: null }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
