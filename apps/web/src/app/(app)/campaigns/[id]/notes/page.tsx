import { Suspense } from 'react';
import { NotesScreen } from '@/features/notes/notes-screen';

export default async function CampaignNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <NotesScreen campaignId={id} noteId={null} />
    </Suspense>
  );
}
