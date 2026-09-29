import { requirePageUser } from '@/server/auth/current';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/layout/page-header';
import { HomeDashboard } from '@/features/home/home-dashboard';

export default async function HomePage() {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader title={ru.home.welcome(user.displayName)} />
      <HomeDashboard />
    </>
  );
}
