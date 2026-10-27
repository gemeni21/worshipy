import { NextRequest, NextResponse } from 'next/server';
import { getWorshipGroup, validateSessionToken } from '@/lib/cloud/cloudDb';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const group = getWorshipGroup(groupId);

    if (!group) {
      return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch group';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
