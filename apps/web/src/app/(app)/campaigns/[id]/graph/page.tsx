import { NotesGraph } from '@/features/notes/notes-graph';

export default async function GraphPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NotesGraph campaignId={id} />;
}
