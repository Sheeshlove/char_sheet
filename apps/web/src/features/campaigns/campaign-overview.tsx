'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon, SettingsIcon, LinkIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { QueryState } from '@/components/query-state';
import { CopyButton } from '@/components/copy-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CampaignNav } from './campaign-nav';
import { CampaignCharacters } from './campaign-characters';
import { DiceRoller } from '@/features/rolls/dice-roller';

export function CampaignOverview({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const campaign = useQuery(trpc.campaigns.get.queryOptions({ campaignId }));
  const c = campaign.data;
  const isGm = c?.role === 'gm' || c?.role === 'co_gm';

  return (
    <QueryState isLoading={campaign.isLoading} error={campaign.error}>
      {c && (
        <>
          <PageHeader
            title={c.name}
            description={
              <>
                {ru.campaigns.owner}: {c.ownerName} · <Badge variant="outline">{ru.campaigns.roles[c.role]}</Badge>
                {c.archivedAt && (
                  <>
                    {' '}
                    <Badge variant="outline">{ru.campaigns.archived}</Badge>
                  </>
                )}
              </>
            }
            actions={
              isGm && (
                <Button variant="outline" asChild>
                  <Link href={`/campaigns/${campaignId}/settings`}>
                    <SettingsIcon />
                    {ru.campaigns.settings}
                  </Link>
                </Button>
              )
            }
          />
          <CampaignNav campaignId={campaignId} isGm={isGm} active="overview" />
          {c.description && <p className="mb-4 text-sm whitespace-pre-line text-muted-foreground">{c.description}</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            <CampaignCharacters campaignId={campaignId} />
            <MembersCard campaignId={campaignId} role={c.role} ownerId={c.ownerId} />
            <DiceRoller campaignId={campaignId} />
            {isGm && <InvitesCard campaignId={campaignId} />}
          </div>
        </>
      )}
    </QueryState>
  );
}

function MembersCard({ campaignId, role, ownerId }: { campaignId: string; role: string; ownerId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const me = useQuery(trpc.auth.me.queryOptions());
  const members = useQuery(trpc.campaigns.members.list.queryOptions({ campaignId }));
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.campaigns.members.list.queryKey({ campaignId }) });
  const setRole = useMutation(trpc.campaigns.members.setRole.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.campaigns.members.remove.mutationOptions({ onSuccess: invalidate }));
  const leave = useMutation(
    trpc.campaigns.leave.mutationOptions({
      onSuccess: () => {
        router.replace('/campaigns');
      },
    }),
  );
  const isGm = role === 'gm' || role === 'co_gm';
  const myId = me.data?.id;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ru.campaigns.members}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y" data-testid="members">
          {members.data?.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{m.displayName}</div>
                <div className="text-xs text-muted-foreground">
                  @{m.username} · {ru.campaigns.joinedAt} {formatDate(m.joinedAt)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant={m.role === 'player' ? 'outline' : 'secondary'}>{ru.campaigns.roles[m.role]}</Badge>
                {isGm && m.userId !== ownerId && m.userId !== myId && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label={ru.common.actions}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {role === 'gm' && (
                        <>
                          <DropdownMenuItem
                            onSelect={() =>
                              setRole.mutate({
                                campaignId,
                                userId: m.userId,
                                role: m.role === 'co_gm' ? 'player' : 'co_gm',
                              })
                            }
                          >
                            {ru.campaigns.setRole}: {ru.campaigns.roles[m.role === 'co_gm' ? 'player' : 'co_gm']}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate({ campaignId, userId: m.userId })}>
                        {ru.campaigns.removeMember}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          ))}
        </ul>
        {myId && myId !== ownerId && (
          <Button className="mt-3" variant="outline" size="sm" onClick={() => leave.mutate({ campaignId })}>
            {ru.campaigns.leave}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function InvitesCard({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [maxUses, setMaxUses] = useState('');
  const [days, setDays] = useState('');
  const invites = useQuery(trpc.campaigns.invites.list.queryOptions({ campaignId }));
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.campaigns.invites.list.queryKey({ campaignId }) });
  const create = useMutation(trpc.campaigns.invites.create.mutationOptions({ onSuccess: invalidate }));
  const revoke = useMutation(trpc.campaigns.invites.revoke.mutationOptions({ onSuccess: invalidate }));
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const num = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ru.campaigns.inviteLink}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ campaignId, maxUses: num(maxUses), expiresInDays: num(days) });
          }}
        >
          <Field label={ru.campaigns.inviteMaxUses} htmlFor="ci-max">
            <Input id="ci-max" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label={ru.campaigns.inviteExpiresDays} htmlFor="ci-days">
            <Input id="ci-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Button type="submit" disabled={create.isPending} data-testid="create-campaign-invite">
            <LinkIcon />
            {ru.campaigns.inviteCreate}
          </Button>
        </form>
        <ul className="grid gap-2">
          {invites.data?.map((inv) => (
            <li key={inv.code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="min-w-0">
                <code className="font-mono" data-testid="campaign-invite-code">
                  {inv.code}
                </code>
                <div className="text-xs text-muted-foreground">
                  {ru.campaigns.inviteUses}: {inv.uses}
                  {inv.maxUses ? ` / ${inv.maxUses}` : ''}
                  {inv.expiresAt ? ` · до ${formatDate(inv.expiresAt)}` : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <CopyButton value={`${origin}/join/${inv.code}`} label={ru.campaigns.inviteLink} />
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate({ campaignId, code: inv.code })}>
                  {ru.admin.inviteRevoke}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
