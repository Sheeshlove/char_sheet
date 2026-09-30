import { BoardsList } from '@/features/notes/boards/boards-list';

export default async function BoardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoardsList campaignId={id} />;
}
