'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { useTRPC, trpcErrorText } from '@/lib/trpc/client';
import { registerInput } from '@/lib/validation/auth';
import { ru } from '@/i18n/ru';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Values = z.input<typeof registerInput>;

export function RegisterForm({ invite }: { invite: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const bootstrap = useQuery(trpc.auth.bootstrapNeeded.queryOptions());
  const form = useForm<Values>({
    resolver: zodResolver(registerInput),
    defaultValues: { email: '', username: '', displayName: '', password: '', inviteCode: invite },
  });
  const register = useMutation(
    trpc.auth.register.mutationOptions({
      meta: { silent: true },
      onSuccess: () => {
        router.replace('/');
        router.refresh();
      },
    }),
  );
  const onSubmit = form.handleSubmit((v) => register.mutate(v));
  const { errors } = form.formState;
  const needInvite = bootstrap.data !== true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{ru.auth.registerTitle}</CardTitle>
        <CardDescription>{ru.auth.inviteHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {needInvite && (
            <Field label={ru.auth.inviteCode} htmlFor="inviteCode" error={errors.inviteCode?.message}>
              <Input id="inviteCode" autoComplete="off" className="uppercase" {...form.register('inviteCode')} />
            </Field>
          )}
          <Field label={ru.auth.email} htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Field label={ru.auth.username} htmlFor="username" hint={ru.auth.usernameHint} error={errors.username?.message}>
            <Input id="username" autoComplete="username" {...form.register('username')} />
          </Field>
          <Field label={ru.auth.displayName} htmlFor="displayName" error={errors.displayName?.message}>
            <Input id="displayName" autoComplete="nickname" {...form.register('displayName')} />
          </Field>
          <Field label={ru.auth.password} htmlFor="password" hint={ru.auth.passwordHint} error={errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
          </Field>
          {register.error && (
            <p role="alert" className="text-sm text-destructive">
              {trpcErrorText(register.error)}
            </p>
          )}
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? ru.common.loading : ru.auth.register}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {ru.auth.haveAccount}{' '}
            <Link className="underline" href="/login">
              {ru.auth.login}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
