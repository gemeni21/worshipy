import { NextResponse } from 'next/server';
import { getApprovedGlobalSongs } from '@/lib/cloud/cloudDb';

export async function GET() {
  const songs = getApprovedGlobalSongs();
  return NextResponse.json({ songs });
}
