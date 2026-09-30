import { Suspense } from 'react';
import { NewCharacter } from '@/features/characters/new-character';

export default function NewCharacterPage() {
  return (
    <Suspense>
      <NewCharacter />
    </Suspense>
  );
}
