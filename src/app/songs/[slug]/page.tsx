import React, { Suspense } from 'react';
import { getAllSongs, getSongBySlug } from '@/lib/catalog/songCatalog';
import { SongChartView } from '@/components/songs/SongChartView';

export function generateStaticParams() {
  return getAllSongs().map((song) => ({
    slug: song.slug,
  }));
}

async function SongDetailContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const song = getSongBySlug(slug);

  return <SongChartView initialSong={song} slug={slug} />;
}

export default function SongDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
          Loading song chart...
        </div>
      }
    >
      <SongDetailContent params={params} />
    </Suspense>
  );
}
