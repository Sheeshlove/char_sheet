'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTRPC, trpcErrorText } from '@/lib/trpc/client';
import { passwordSchema } from '@/lib/validation/auth';
import { ru } from '@/i18n/ru';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function ResetForm({ token }: { token: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = useMutation(
    trpc.auth.resetWithToken.mutationOptions({
      meta: { silent: true },
      onSuccess: () => {
        toast.success(ru.auth.resetDone);
        router.replace('/login');
      },
      onError: (e) => setError(trpcErrorText(e)),
    }),
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? ru.errors.BAD_REQUEST);
    if (password !== repeat) return setError(ru.auth.passwordsMismatch);
    setError(null);
    reset.mutate({ token, password });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{ru.auth.resetTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label={ru.auth.newPassword} htmlFor="password" hint={ru.auth.passwordHint}>
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={ru.auth.passwordRepeat} htmlFor="repeat">
            <Input id="repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={reset.isPending}>
            {ru.common.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
