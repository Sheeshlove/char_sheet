'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotebookPenIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { noteFilterSchema } from '@/lib/notes/schema';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { notesBase } from './notes-sidebar';
import { VIS_ICON } from './notes-list';

const N = ru.notes;

/** Вкладка «Заметки» листа (§11.7): заметки о персонаже и быстрая личная заметка. */
export function CharacterNotes({ characterId, campaignId }: { characterId: string; campaignId: string | null }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const base = notesBase(campaignId);
  const list = useQuery(
    trpc.notes.list.queryOptions({ campaignId, filter: noteFilterSchema.parse({ characterId }), limit: 100 }),
  );
  const create = useMutation(
    trpc.notes.create.mutationOptions({
      onSuccess: ({ id }) => {
        void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
        router.push(`${base}/${id}`);
      },
    }),
  );
  const items = list.data?.items ?? [];
  return (
    <section className="grid gap-3" data-testid="character-notes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{N.characterNotes}</h2>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`${base}?char=${characterId}`}>{N.openAll}</Link>
          </Button>
          <Button
            onClick={() => create.mutate({ campaignId, characterId, type: 'general', visibility: 'private', title: '' })}
            disabled={create.isPending}
            data-testid="quick-note"
          >
            <NotebookPenIcon />
            {N.quickNote}
          </Button>
        </div>
      </div>
      {items.length ? (
        <ul className="grid gap-1.5">
          {items.map((n) => {
            const Vis = VIS_ICON[n.visibility];
            return (
              <li key={n.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Link href={`${base}/${n.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {n.title || N.untitled}
                </Link>
                <Badge variant="outline">{N.types[n.type]}</Badge>
                <Vis className="size-3.5 text-muted-foreground" aria-label={N.visibilities[n.visibility]} />
                <span className="text-xs text-muted-foreground">{formatDate(n.updatedAt)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        !list.isLoading && <p className="text-sm text-muted-foreground">{N.noCharacterNotes}</p>
      )}
    </section>
  );
}
