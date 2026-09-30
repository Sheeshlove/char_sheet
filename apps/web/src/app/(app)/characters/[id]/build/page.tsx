import { Suspense } from 'react';
import { CharacterBuilder } from '@/features/characters/builder/character-builder';

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <CharacterBuilder characterId={id} />
    </Suspense>
  );
}
