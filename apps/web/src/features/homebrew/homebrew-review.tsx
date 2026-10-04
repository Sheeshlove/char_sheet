'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckIcon, XIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { effectSummary, entityEffects } from './preview';

const H = ru.homebrew;

/** Вкладка «Homebrew на одобрение» панели мастера (SPEC §13–14). */
export function HomebrewReview({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const list = useQuery(trpc.homebrew.list.queryOptions({ scope: 'campaign', campaignId, status: 'proposed' }));
  if (list.data && !list.data.length) return <p className="text-sm text-muted-foreground">{H.noPending}</p>;
  return (
    <ul className="grid gap-3" data-testid="hb-review">
      {list.data?.map((e) => <ReviewItem key={e.key} entityKey={e.key} campaignId={campaignId} />)}
    </ul>
  );
}

function ReviewItem({ entityKey, campaignId }: { entityKey: string; campaignId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const entity = useQuery(trpc.homebrew.get.queryOptions({ key: entityKey }));
  const [comment, setComment] = useState('');
  const review = useMutation(
    trpc.homebrew.review.mutationOptions({
      onSuccess: (_, v) => {
        toast.success(v.decision === 'approve' ? H.approved : H.rejected);
        void qc.invalidateQueries({ queryKey: trpc.homebrew.list.pathKey() });
        void qc.invalidateQueries({ queryKey: trpc.homebrew.pendingCount.queryKey({ campaignId }) });
        void qc.invalidateQueries({ queryKey: ['content-bundle'] });
      },
    }),
  );
  const e = entity.data;
  if (!e) return null;
  const effects = entityEffects(e.data);
  return (
    <li className="grid gap-2 rounded-lg border p-3" data-testid="hb-review-item">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/homebrew/${e.key}/edit`} className="font-semibold hover:underline">
          {e.nameRu}
        </Link>
        <Badge variant="outline">{H.kinds[e.kind]}</Badge>
      </div>
      {e.textMd && <Markdown className="text-sm">{e.textMd}</Markdown>}
      {effects.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {effects.map((ef, i) => (
            <li key={i}>{effectSummary(ef)}</li>
          ))}
        </ul>
      )}
      <Textarea value={comment} onChange={(ev) => setComment(ev.target.value)} placeholder={H.reviewComment} aria-label={H.reviewComment} rows={2} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => review.mutate({ key: e.key, decision: 'approve', comment })} disabled={review.isPending} data-testid="hb-approve">
          <CheckIcon />
          {H.approve}
        </Button>
        <Button size="sm" variant="outline" onClick={() => review.mutate({ key: e.key, decision: 'reject', comment })} disabled={review.isPending}>
          <XIcon />
          {H.reject}
        </Button>
      </div>
    </li>
  );
}
