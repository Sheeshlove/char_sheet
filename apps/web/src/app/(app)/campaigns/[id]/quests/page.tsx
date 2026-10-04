import { QuestBoard } from '@/features/notes/quest-board';

export default async function QuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuestBoard campaignId={id} />;
}
