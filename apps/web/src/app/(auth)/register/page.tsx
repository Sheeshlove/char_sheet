import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current';
import { ru } from '@/i18n/ru';
import { RegisterForm } from '@/features/auth/register-form';

export const metadata: Metadata = { title: ru.auth.registerTitle };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (await getCurrentUser()) redirect('/');
  const { invite } = await searchParams;
  return <RegisterForm invite={invite ?? ''} />;
}
