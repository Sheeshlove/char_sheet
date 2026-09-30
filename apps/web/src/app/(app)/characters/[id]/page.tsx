import { Suspense } from 'react';
import { CharacterSheet } from '@/features/characters/sheet/character-sheet';

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <CharacterSheet characterId={id} />
    </Suspense>
  );
}
