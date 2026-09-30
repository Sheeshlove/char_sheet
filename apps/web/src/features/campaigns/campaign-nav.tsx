'use client';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';

export type CampaignSection = 'overview' | 'gm' | 'notes' | 'quests' | 'timeline' | 'graph' | 'boards' | 'settings';

type Item = { key: CampaignSection; href: string; label: string; gmOnly?: boolean };

export function campaignNavItems(campaignId: string): Item[] {
  const base = `/campaigns/${campaignId}`;
  return [
    { key: 'overview', href: base, label: ru.campaigns.overview },
    { key: 'gm', href: `${base}/gm`, label: ru.gm.title, gmOnly: true },
    { key: 'notes', href: `${base}/notes`, label: ru.notes.views.list },
    { key: 'quests', href: `${base}/quests`, label: ru.notes.views.quests },
    { key: 'timeline', href: `${base}/timeline`, label: ru.notes.views.timeline },
    { key: 'graph', href: `${base}/graph`, label: ru.notes.views.graph },
    { key: 'boards', href: `${base}/boards`, label: ru.notes.views.boards },
    { key: 'settings', href: `${base}/settings`, label: ru.campaigns.settings, gmOnly: true },
  ];
}

export function CampaignNav({ campaignId, isGm, active }: { campaignId: string; isGm: boolean; active: CampaignSection }) {
  const items = campaignNavItems(campaignId).filter((i) => !i.gmOnly || isGm);
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b [scrollbar-width:none]" aria-label={ru.campaigns.title}>
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={active === i.key ? 'page' : undefined}
          className={cn(
            '-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground pointer-coarse:py-3',
            active === i.key && 'border-primary text-foreground',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
