import { Suspense } from 'react';
import { GmPanel } from '@/features/gm/gm-panel';

export default async function GmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <GmPanel campaignId={id} />
    </Suspense>
  );
}
