import type { Metadata } from 'next';
import { requirePageAdmin } from '@/server/auth/current';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/layout/page-header';
import { AdminView } from '@/features/admin/admin-view';

export const metadata: Metadata = { title: ru.nav.admin };

export default async function AdminPage() {
  const user = await requirePageAdmin();
  return (
    <>
      <PageHeader title={ru.admin.title} />
      <AdminView currentUserId={user.id} />
    </>
  );
}
