import { NotesTimeline } from '@/features/notes/notes-timeline';

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NotesTimeline campaignId={id} />;
}
