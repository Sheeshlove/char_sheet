'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { NOTE_VISIBILITIES, type NoteVisibilityValue } from '@/lib/notes/schema';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NotesHeader } from '../notes-screen';
import { VIS_ICON } from '../notes-list';

const N = ru.notes;

/** Доски улик кампании (§11.4). */
export function BoardsList({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const boards = useQuery(trpc.boards.list.queryOptions({ campaignId }));
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibilityValue>('party');
  const create = useMutation(
    trpc.boards.create.mutationOptions({ onSuccess: ({ id }) => router.push(`/campaigns/${campaignId}/boards/${id}`) }),
  );
  return (
    <>
      <NotesHeader campaignId={campaignId} section="boards" />
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ campaignId, name: name.trim(), visibility });
        }}
      >
        <Input className="max-w-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={N.boards.name} aria-label={N.boards.name} maxLength={120} />
        <Select value={visibility} onValueChange={(v) => setVisibility(v as NoteVisibilityValue)}>
          <SelectTrigger className="w-40" aria-label={N.visibility}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTE_VISIBILITIES.map((v) => (
              <SelectItem key={v} value={v}>
                {N.visibilities[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          <PlusIcon />
          {N.boards.new}
        </Button>
      </form>
      {boards.data && !boards.data.length && <p className="text-sm text-muted-foreground">{N.boards.empty}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="boards-list">
        {boards.data?.map((b) => {
          const Vis = VIS_ICON[b.visibility];
          return (
            <Link key={b.id} href={`/campaigns/${campaignId}/boards/${b.id}`} className="group">
              <Card className="transition-colors group-hover:border-primary/60">
                <CardContent className="grid gap-1">
                  <span className="font-semibold">{b.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Vis className="size-3" />
                    {N.visibilities[b.visibility]} · {formatDate(b.updatedAt)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
