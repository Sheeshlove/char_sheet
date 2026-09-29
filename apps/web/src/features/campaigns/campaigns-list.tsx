'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusIcon, UsersIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { plural } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function CampaignsList() {
  const trpc = useTRPC();
  const list = useQuery(trpc.campaigns.list.queryOptions());
  const active = list.data?.filter((c) => !c.archivedAt) ?? [];
  const archived = list.data?.filter((c) => c.archivedAt) ?? [];
  return (
    <>
      <PageHeader title={ru.campaigns.title} actions={<CreateCampaignDialog />} />
      <QueryState isLoading={list.isLoading} error={list.error}>
        {active.length === 0 && archived.length === 0 ? (
          <EmptyState>{ru.campaigns.none}</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="campaign-list">
            {[...active, ...archived].map((c) => (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/60">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      <Badge variant={c.role === 'player' ? 'outline' : 'secondary'}>{ru.campaigns.roles[c.role]}</Badge>
                    </CardTitle>
                    {c.description && <CardDescription className="line-clamp-2">{c.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
                    <UsersIcon className="size-3.5" />
                    {c.members} {plural(c.members, ['участник', 'участника', 'участников'])}
                    {c.archivedAt && <Badge variant="outline">{ru.campaigns.archived}</Badge>}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}

function CreateCampaignDialog() {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation(
    trpc.campaigns.create.mutationOptions({
      onSuccess: ({ id }) => {
        setOpen(false);
        router.push(`/campaigns/${id}`);
      },
    }),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          {ru.campaigns.create}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ru.campaigns.create}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate({ name, description });
          }}
        >
          <Field label={ru.campaigns.name} htmlFor="c-name">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label={ru.campaigns.description} htmlFor="c-desc">
            <Textarea id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {ru.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
