import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current';
import { ru } from '@/i18n/ru';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: ru.auth.loginTitle };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect('/');
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}
