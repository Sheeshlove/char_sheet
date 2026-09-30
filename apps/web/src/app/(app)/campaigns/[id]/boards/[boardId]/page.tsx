import { BoardView } from '@/features/notes/boards/board-view';

export default async function BoardPage({ params }: { params: Promise<{ id: string; boardId: string }> }) {
  const { id, boardId } = await params;
  return <BoardView campaignId={id} boardId={boardId} />;
}
