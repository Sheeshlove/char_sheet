import { Suspense } from 'react';
import { CharacterSheet } from '@/features/characters/sheet/character-sheet';
import { getServerQueryClient, HydrateClient, serverTrpc } from '@/lib/trpc/server';

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Лист (с посчитанным сервером расчётом) — сразу в HTML; ошибки доступа покажет клиент.
  await getServerQueryClient().prefetchQuery(serverTrpc.characters.get.queryOptions({ characterId: id }));
  return (
    <HydrateClient>
      <Suspense>
        <CharacterSheet characterId={id} />
      </Suspense>
    </HydrateClient>
  );
}
