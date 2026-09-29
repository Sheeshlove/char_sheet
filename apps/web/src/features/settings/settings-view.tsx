'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTRPC } from '@/lib/trpc/client';
import { passwordSchema } from '@/lib/validation/auth';
import { ru } from '@/i18n/ru';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function SettingsView(props: { displayName: string; email: string; username: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(props.displayName);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);

  const updateProfile = useMutation(
    trpc.auth.updateProfile.mutationOptions({
      onSuccess: () => {
        toast.success(ru.common.saved);
        router.refresh();
      },
    }),
  );
  const changePassword = useMutation(
    trpc.auth.changePassword.mutationOptions({
      onSuccess: () => {
        toast.success(ru.auth.passwordChanged);
        setCurrent('');
        setNext('');
        setRepeat('');
        qc.invalidateQueries({ queryKey: trpc.auth.sessions.list.queryKey() });
      },
    }),
  );
  const sessions = useQuery(trpc.auth.sessions.list.queryOptions());
  const revoke = useMutation(
    trpc.auth.sessions.revoke.mutationOptions({
      onSuccess: (_d, vars) => {
        const wasCurrent = sessions.data?.find((s) => s.id === vars.id)?.current;
        if (wasCurrent) {
          router.replace('/login');
          router.refresh();
        } else qc.invalidateQueries({ queryKey: trpc.auth.sessions.list.queryKey() });
      },
    }),
  );

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(next);
    if (!parsed.success) return setPwError(parsed.error.issues[0]?.message ?? ru.errors.BAD_REQUEST);
    if (next !== repeat) return setPwError(ru.auth.passwordsMismatch);
    setPwError(null);
    changePassword.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{ru.auth.profile}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              updateProfile.mutate({ displayName });
            }}
          >
            <Field label={ru.auth.email}>
              <Input value={props.email} disabled />
            </Field>
            <Field label={ru.auth.username}>
              <Input value={props.username} disabled />
            </Field>
            <Field label={ru.auth.displayName} htmlFor="displayName">
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64} />
            </Field>
            <Field label={ru.nav.theme}>
              <Select value={theme ?? 'dark'} onValueChange={setTheme}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">{ru.nav.themeDark}</SelectItem>
                  <SelectItem value="light">{ru.nav.themeLight}</SelectItem>
                  <SelectItem value="system">{ru.nav.themeSystem}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div>
              <Button type="submit" disabled={updateProfile.isPending}>
                {ru.common.save}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{ru.auth.changePassword}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submitPassword} noValidate>
            <Field label={ru.auth.currentPassword} htmlFor="cur">
              <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <Field label={ru.auth.newPassword} htmlFor="new" hint={ru.auth.passwordHint}>
              <Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <Field label={ru.auth.passwordRepeat} htmlFor="rep" error={pwError}>
              <Input id="rep" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </Field>
            <div>
              <Button type="submit" disabled={changePassword.isPending}>
                {ru.auth.changePassword}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{ru.auth.sessions}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ru.auth.sessionAgent}</TableHead>
                <TableHead>{ru.auth.sessionIp}</TableHead>
                <TableHead>{ru.auth.sessionCreated}</TableHead>
                <TableHead>{ru.auth.sessionExpires}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-64 truncate" title={s.userAgent ?? ''}>
                    {s.userAgent || ru.common.unknown}{' '}
                    {s.current && <Badge variant="secondary">{ru.auth.sessionCurrent}</Badge>}
                  </TableCell>
                  <TableCell>{s.ip}</TableCell>
                  <TableCell>{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell>{formatDateTime(s.expiresAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => revoke.mutate({ id: s.id })}>
                      {ru.auth.sessionRevoke}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
