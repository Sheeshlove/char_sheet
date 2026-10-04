import type { Metadata } from 'next';
import { ru } from '@/i18n/ru';
import { ResetForm } from '@/features/auth/reset-form';

export const metadata: Metadata = { title: ru.auth.resetTitle };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResetForm token={token} />;
}
