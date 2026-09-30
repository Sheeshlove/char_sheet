import { LevelUpWizard } from '@/features/characters/level-up/level-up-wizard';

export default async function LevelUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LevelUpWizard characterId={id} />;
}
