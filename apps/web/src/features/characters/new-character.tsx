'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NONE = 'none';

/** `/characters/new`: черновик создаётся сразу, дальше — шаги конструктора (SPEC §9). */
export function NewCharacter() {
  const trpc = useTRPC();
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState('');
  const [campaignId, setCampaignId] = useState(params.get('campaign') ?? NONE);
  const targets = useQuery(trpc.characters.attachTargets.queryOptions());
  const create = useMutation(
    trpc.characters.create.mutationOptions({
      onSuccess: ({ id }) => router.replace(`/characters/${id}/build`),
    }),
  );
  return (
    <>
      <PageHeader title={ru.characters.newTitle} />
      <Card className="max-w-lg">
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ name: name.trim(), campaignId: campaignId === NONE ? null : campaignId });
            }}
          >
            <Field label={ru.characters.nameLabel} htmlFor="nc-name">
              <Input
                id="nc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={ru.characters.namePlaceholder}
                maxLength={120}
                autoFocus
              />
            </Field>
            <Field label={ru.characters.campaignLabel} htmlFor="nc-campaign">
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id="nc-campaign">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{ru.characters.campaignNone}</SelectItem>
                  {targets.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit" disabled={create.isPending}>
              {ru.characters.start}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
