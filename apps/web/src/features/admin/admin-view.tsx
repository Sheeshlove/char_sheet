'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CopyButton } from '@/components/copy-button';
import { PacksPanel } from './packs-panel';

function origin() {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

export function AdminView({ currentUserId }: { currentUserId: string }) {
  return (
    <div className="grid gap-4">
      <InvitesPanel />
      <UsersPanel currentUserId={currentUserId} />
      <PacksPanel />
    </div>
  );
}

function InvitesPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [days, setDays] = useState('');
  const list = useQuery(trpc.admin.invites.list.queryOptions());
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.admin.invites.list.queryKey() });
  const create = useMutation(
    trpc.admin.invites.create.mutationOptions({
      onSuccess: () => {
        setNote('');
        setDays('');
        invalidate();
      },
    }),
  );
  const revoke = useMutation(trpc.admin.invites.revoke.mutationOptions({ onSuccess: invalidate }));

  const statusBadge = (s: string, who: string | null) => {
    if (s === 'used') return <Badge variant="secondary">{ru.admin.inviteUsed(who ?? '')}</Badge>;
    if (s === 'expired') return <Badge variant="outline">{ru.admin.inviteExpired}</Badge>;
    if (s === 'revoked') return <Badge variant="outline">{ru.admin.inviteRevoke}</Badge>;
    return <Badge variant="success">{ru.admin.inviteActive}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ru.admin.invites}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const d = days.trim() ? Number(days) : null;
            create.mutate({ note, expiresInDays: d && Number.isFinite(d) ? d : null });
          }}
        >
          <Field label={ru.admin.inviteNote} htmlFor="inv-note">
            <Input id="inv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </Field>
          <Field label={ru.admin.inviteExpiresDays} htmlFor="inv-days">
            <Input id="inv-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Button type="submit" disabled={create.isPending} data-testid="create-invite">
            {ru.admin.createInvite}
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ru.admin.inviteCode}</TableHead>
              <TableHead>{ru.admin.inviteNote}</TableHead>
              <TableHead>{ru.admin.inviteStatus}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.map((inv) => (
              <TableRow key={inv.code}>
                <TableCell className="font-mono" data-testid="invite-code">
                  {inv.code}
                </TableCell>
                <TableCell>{inv.note}</TableCell>
                <TableCell>
                  {statusBadge(inv.status, inv.usedByName)}
                  {inv.expiresAt && inv.status === 'active' && (
                    <span className="ml-2 text-xs text-muted-foreground">до {formatDate(inv.expiresAt)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {inv.status === 'active' && (
                    <div className="flex justify-end gap-2">
                      <CopyButton value={`${origin()}/register?invite=${inv.code}`} label={ru.admin.inviteLink} />
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate({ code: inv.code })}>
                        {ru.admin.inviteRevoke}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [resetLinks, setResetLinks] = useState<Record<string, string>>({});
  const list = useQuery(trpc.admin.users.list.queryOptions());
  const setAdmin = useMutation(
    trpc.admin.users.setAdmin.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: trpc.admin.users.list.queryKey() }),
    }),
  );
  const createReset = useMutation(
    trpc.admin.users.createResetLink.mutationOptions({
      onSuccess: (res, vars) => setResetLinks((m) => ({ ...m, [vars.userId]: `${origin()}${res.path}` })),
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ru.admin.users}</CardTitle>
        <CardDescription>{ru.admin.resetLinkHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ru.auth.displayName}</TableHead>
              <TableHead>{ru.auth.email}</TableHead>
              <TableHead>{ru.admin.registered}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">
                    {u.displayName} {u.isAdmin && <Badge variant="secondary">{ru.admin.userAdmin}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">@{u.username}</div>
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{formatDate(u.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    {u.id !== currentUserId && (
                      <Button size="sm" variant="ghost" onClick={() => setAdmin.mutate({ userId: u.id, isAdmin: !u.isAdmin })}>
                        {u.isAdmin ? ru.admin.removeAdmin : ru.admin.makeAdmin}
                      </Button>
                    )}
                    {resetLinks[u.id] ? (
                      <CopyButton value={resetLinks[u.id]!} label={ru.admin.resetLink} />
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => createReset.mutate({ userId: u.id })}>
                        {ru.admin.resetLink}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
