'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useMutation } from '@tanstack/react-query';
import {
  BookOpenIcon,
  FlaskConicalIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  NotebookPenIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
  SwordsIcon,
  UsersIcon,
} from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GlobalSearch } from '@/features/search/global-search';
import { OfflineBanner } from './offline-banner';

export type ShellUser = { displayName: string; username: string; isAdmin: boolean };

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; admin?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: ru.nav.home, icon: HomeIcon },
  { href: '/characters', label: ru.nav.characters, icon: SwordsIcon },
  { href: '/campaigns', label: ru.nav.campaigns, icon: UsersIcon },
  { href: '/notes', label: ru.nav.notes, icon: NotebookPenIcon },
  { href: '/library', label: ru.nav.library, icon: BookOpenIcon },
  { href: '/homebrew', label: ru.nav.homebrew, icon: FlaskConicalIcon },
  { href: '/admin', label: ru.nav.admin, icon: ShieldIcon, admin: true },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const trpc = useTRPC();
  const { resolvedTheme, setTheme } = useTheme();
  const logout = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: () => {
        router.replace('/login');
        router.refresh();
      },
    }),
  );
  const items = NAV_ITEMS.filter((i) => !i.admin || user.isAdmin);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {ru.nav.skipToContent}
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={ru.nav.menu}>
                <MenuIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {items.map((i) => (
                <DropdownMenuItem key={i.href} asChild>
                  <Link href={i.href}>
                    <i.icon />
                    {i.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/" className="mr-2 font-bold tracking-tight">
            {ru.app.name}
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label={ru.nav.menu}>
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={isActive(pathname, i.href) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  isActive(pathname, i.href) && 'bg-accent text-foreground',
                )}
              >
                <i.icon className="size-4" />
                {i.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <GlobalSearch />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="max-w-48" data-testid="user-menu">
                  <span className="truncate">{user.displayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="font-medium">{user.displayName}</div>
                  <div className="text-xs text-muted-foreground">@{user.username}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <SettingsIcon />
                    {ru.nav.settings}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                  {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
                  {resolvedTheme === 'dark' ? ru.nav.themeLight : ru.nav.themeDark}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout.mutate()} data-testid="logout">
                  <LogOutIcon />
                  {ru.nav.logout}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <OfflineBanner />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
