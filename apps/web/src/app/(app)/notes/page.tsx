import { Suspense } from 'react';
import { NotesScreen } from '@/features/notes/notes-screen';

export default function PersonalNotesPage() {
  return (
    <Suspense>
      <NotesScreen campaignId={null} noteId={null} />
    </Suspense>
  );
}
