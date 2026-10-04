import type { ContentKind } from '@ps/content-schema';

export const DNDSU_BASE = 'https://dnd.su';

/** Секции импорта (SPEC §7.2). Бестиарий не импортируется. */
export const SECTIONS = ['classes', 'races', 'backgrounds', 'feats', 'spells', 'items'] as const;
export type Section = (typeof SECTIONS)[number];

/** Сегмент URL секции на dnd.su (SPEC §7.3). */
export const SECTION_PATH: Record<Section, string> = {
  classes: 'class',
  races: 'race',
  backgrounds: 'backgrounds',
  feats: 'feats',
  spells: 'spells',
  items: 'items',
};

/** Вид сущности по умолчанию; страницы классов/рас могут оказаться подклассами/подрасами. */
export const SECTION_KIND: Record<Section, ContentKind> = {
  classes: 'class',
  races: 'race',
  backgrounds: 'background',
  feats: 'feat',
  spells: 'spell',
  items: 'item',
};

export const PACK_OFFICIAL = 'dndsu-official';
export const PACK_HOMEBREW = 'dndsu-homebrew';

export function packOf(homebrew: boolean): string {
  return homebrew ? PACK_HOMEBREW : PACK_OFFICIAL;
}

export function isSection(s: string): s is Section {
  return (SECTIONS as readonly string[]).includes(s);
}

/** URL страницы-списка секции. */
export function listUrl(section: Section, homebrew: boolean): string {
  return `${DNDSU_BASE}/${homebrew ? 'homebrew/' : ''}${SECTION_PATH[section]}/`;
}

export type EntityUrl = {
  url: string;
  section: Section;
  homebrew: boolean;
  externalId: number;
  slug: string;
};

const PATH_TO_SECTION = new Map(Object.entries(SECTION_PATH).map(([s, p]) => [p, s as Section]));

/**
 * Разбор URL сущности: `/<section>/<id>-<slug>/`, homebrew — `/homebrew/<section>/<id>-<slug>/`.
 * Относительные ссылки разрешаются от `base`. Прочие ссылки → `null`.
 */
export function parseEntityUrl(href: string, base: string = DNDSU_BASE): EntityUrl | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (u.hostname !== 'dnd.su' && u.hostname !== 'www.dnd.su') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const homebrew = parts[0] === 'homebrew';
  if (homebrew) parts.shift();
  if (parts.length !== 2) return null;
  const section = PATH_TO_SECTION.get(parts[0]!);
  const m = /^(\d+)-([a-z0-9][a-z0-9_-]*)$/i.exec(parts[1]!);
  if (!section || !m) return null;
  const externalId = Number(m[1]);
  const slug = m[2]!.toLowerCase();
  return {
    url: `${DNDSU_BASE}/${homebrew ? 'homebrew/' : ''}${parts[0]}/${externalId}-${slug}/`,
    section,
    homebrew,
    externalId,
    slug,
  };
}

/** Внешний ключ страницы для `key-map.json`: `homebrew/class/853`, `spells/205`. */
export function externalKey(e: Pick<EntityUrl, 'section' | 'homebrew' | 'externalId'>): string {
  return `${e.homebrew ? 'homebrew/' : ''}${SECTION_PATH[e.section]}/${e.externalId}`;
}
