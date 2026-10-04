import { requirePageUser } from '@/server/auth/current';
import { AppShell } from '@/components/layout/app-shell';
import { getThemeChoice, serverResolvedTheme } from '@/server/theme';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const theme = serverResolvedTheme(await getThemeChoice());
  return (
    <AppShell
      user={{ displayName: user.displayName, username: user.username, isAdmin: user.isAdmin }}
      serverTheme={theme}
    >
      {children}
    </AppShell>
  );
}
