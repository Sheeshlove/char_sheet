'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon } from 'lucide-react';
import { trpcErrorText, useTRPC, useTRPCClient } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { noteFilterSchema, QUEST_STATUSES, type QuestStatus } from '@/lib/notes/schema';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NotesHeader } from './notes-screen';

const N = ru.notes;
const FILTER = noteFilterSchema.parse({ types: ['quest'], sort: 'title' });

/** Канбан квестов (§11.4): колонки по статусу, перетаскивание меняет статус. */
export function QuestBoard({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const router = useRouter();
  const opts = trpc.notes.list.queryOptions({ campaignId, filter: FILTER, limit: 200 });
  const list = useQuery(opts);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<QuestStatus | null>(null);
  const create = useMutation(
    trpc.notes.create.mutationOptions({
      onSuccess: ({ id }) => {
        void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
        router.push(`/campaigns/${campaignId}/notes/${id}`);
      },
    }),
  );
  const items = list.data?.items ?? [];
  const statusOf = (f: Record<string, unknown>): QuestStatus =>
    (QUEST_STATUSES as readonly string[]).includes(f.status as string) ? (f.status as QuestStatus) : 'active';

  const move = async (noteId: string, status: QuestStatus) => {
    const item = items.find((i) => i.id === noteId);
    if (!item || statusOf(item.fields) === status) return;
    const fields = { ...item.fields, status };
    qc.setQueryData(opts.queryKey, (old) =>
      old ? { ...old, items: old.items.map((i) => (i.id === noteId ? { ...i, fields } : i)) } : old,
    );
    try {
      const res = await client.notes.update.mutate({ noteId, expectedUpdatedAt: item.updatedAt, patch: { fields } });
      qc.setQueryData(opts.queryKey, (old) =>
        old ? { ...old, items: old.items.map((i) => (i.id === noteId ? { ...i, updatedAt: res.updatedAt } : i)) } : old,
      );
    } catch (e) {
      toast.error(trpcErrorText(e));
    }
    void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
  };

  return (
    <>
      <NotesHeader
        campaignId={campaignId}
        section="quests"
        actions={
          <Button onClick={() => create.mutate({ campaignId, type: 'quest', title: N.quests.newQuest, visibility: 'party' })} disabled={create.isPending}>
            <PlusIcon />
            {N.quests.newQuest}
          </Button>
        }
      />
      {!list.isLoading && !items.length && <p className="mb-3 text-sm text-muted-foreground">{N.quests.empty}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="quest-board">
        {QUEST_STATUSES.map((status) => {
          const col = items.filter((i) => statusOf(i.fields) === status);
          return (
            <section
              key={status}
              aria-label={N.questStatus[status]}
              data-testid={`quest-col-${status}`}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/x-note-id') || dragging;
                setOver(null);
                setDragging(null);
                if (id) void move(id, status);
              }}
              className={cn('flex min-h-40 flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-colors', over === status && 'border-primary bg-accent/50')}
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
                {N.questStatus[status]}
                <span className="text-xs text-muted-foreground">{col.length}</span>
              </h2>
              {col.map((q) => (
                <article
                  key={q.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-note-id', q.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragging(q.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cn('grid cursor-grab gap-1.5 rounded-md border bg-background p-2 text-sm shadow-xs', dragging === q.id && 'opacity-50')}
                  data-testid="quest-card"
                >
                  <Link href={`/campaigns/${campaignId}/notes/${q.id}`} className="font-medium hover:underline">
                    {q.title || N.untitled}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {typeof q.fields.priority === 'number' && <Badge variant="outline">{N.priorities[String(q.fields.priority)]}</Badge>}
                    {typeof q.fields.rewardRu === 'string' && q.fields.rewardRu && <span className="truncate">{q.fields.rewardRu}</span>}
                  </div>
                  <Select value={status} onValueChange={(v) => void move(q.id, v as QuestStatus)}>
                    <SelectTrigger size="sm" className="h-7 text-xs" aria-label={`${N.quests.moveTo}: ${q.title || N.untitled}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUEST_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {N.questStatus[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
