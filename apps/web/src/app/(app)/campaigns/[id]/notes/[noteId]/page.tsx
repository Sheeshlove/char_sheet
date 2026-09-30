import { Suspense } from 'react';
import { NotesScreen } from '@/features/notes/notes-screen';

export default async function CampaignNotePage({ params }: { params: Promise<{ id: string; noteId: string }> }) {
  const { id, noteId } = await params;
  return (
    <Suspense>
      <NotesScreen campaignId={id} noteId={noteId} />
    </Suspense>
  );
}
