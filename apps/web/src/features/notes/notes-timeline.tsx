'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { NotesHeader } from './notes-screen';

const N = ru.notes;

/** Хронология (§11.4): заметки, сгруппированные по номеру сессии, с датами. */
export function NotesTimeline({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const q = useQuery(trpc.notes.timeline.queryOptions({ campaignId }));
  const groups = new Map<number, NonNullable<typeof q.data>>();
  for (const n of q.data ?? []) groups.set(n.sessionNo!, [...(groups.get(n.sessionNo!) ?? []), n]);
  return (
    <>
      <NotesHeader campaignId={campaignId} section="timeline" />
      {!q.isLoading && !groups.size && <p className="text-sm text-muted-foreground">{N.timeline.empty}</p>}
      <ol className="relative grid gap-6 border-l pl-6" data-testid="timeline">
        {[...groups].map(([no, items]) => {
          const session = items.find((i) => i.type === 'session');
          const dates = [session?.realDate ? formatDate(session.realDate) : null, session?.gameDate].filter(Boolean).join(' · ');
          return (
            <li key={no} className="relative">
              <span className="absolute top-1.5 -left-[31px] size-3 rounded-full border-2 border-background bg-primary" aria-hidden />
              <h2 className="font-semibold">
                {N.sessionShort(no)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{dates || N.timeline.noDate}</span>
              </h2>
              <ul className="mt-2 grid gap-1.5">
                {items.map((n) => (
                  <li key={n.id} className="flex items-center gap-2 text-sm">
                    <Badge variant={n.type === 'session' ? 'secondary' : 'outline'}>{N.types[n.type]}</Badge>
                    <Link href={`/campaigns/${campaignId}/notes/${n.id}`} className="truncate hover:underline">
                      {n.title || N.untitled}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </>
  );
}
