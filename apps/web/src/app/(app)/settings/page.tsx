import type { Metadata } from 'next';
import { requirePageUser } from '@/server/auth/current';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsView } from '@/features/settings/settings-view';

export const metadata: Metadata = { title: ru.nav.settings };

export default async function SettingsPage() {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader title={ru.nav.settings} />
      <SettingsView displayName={user.displayName} email={user.email} username={user.username} />
    </>
  );
}
