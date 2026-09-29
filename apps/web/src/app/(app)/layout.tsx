import { requirePageUser } from '@/server/auth/current';
import { AppShell } from '@/components/layout/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <AppShell user={{ displayName: user.displayName, username: user.username, isAdmin: user.isAdmin }}>
      {children}
    </AppShell>
  );
}
