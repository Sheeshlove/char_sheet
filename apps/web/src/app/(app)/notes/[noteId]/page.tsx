import { Suspense } from 'react';
import { NotesScreen } from '@/features/notes/notes-screen';

export default async function PersonalNotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  return (
    <Suspense>
      <NotesScreen campaignId={null} noteId={noteId} />
    </Suspense>
  );
}
