'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import type { z } from 'zod';
import { useTRPC, trpcErrorText } from '@/lib/trpc/client';
import { loginInput } from '@/lib/validation/auth';
import { ru } from '@/i18n/ru';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Values = z.input<typeof loginInput>;

export function LoginForm() {
  const trpc = useTRPC();
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(loginInput), defaultValues: { login: '', password: '' } });
  const login = useMutation(
    trpc.auth.login.mutationOptions({
      meta: { silent: true },
      onSuccess: () => {
        router.replace('/');
        router.refresh();
      },
    }),
  );
  const onSubmit = form.handleSubmit((v) => login.mutate(v));
  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{ru.auth.loginTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label={ru.auth.loginField} htmlFor="login" error={errors.login?.message}>
            <Input id="login" autoComplete="username" autoFocus {...form.register('login')} />
          </Field>
          <Field label={ru.auth.password} htmlFor="password" error={errors.password?.message}>
            <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
          </Field>
          {login.error && (
            <p role="alert" className="text-sm text-destructive">
              {trpcErrorText(login.error)}
            </p>
          )}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? ru.common.loading : ru.auth.login}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {ru.auth.noAccount}{' '}
            <Link className="underline" href="/register">
              {ru.auth.registerTitle}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
