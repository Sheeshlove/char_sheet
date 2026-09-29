/** Slug из английского текста: `Unarmored Defense` → `unarmored-defense`. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '',
  ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Транслитерация русского названия в slug (когда английского названия нет, SPEC §7.6). */
export function translitSlug(s: string): string {
  return slugify(
    s
      .toLowerCase()
      .split('')
      .map((c) => TRANSLIT[c] ?? c)
      .join(''),
  );
}

/** Абзацы описания → Markdown. Строки, начинающиеся с «- », сохраняются списком. */
export function paragraphs(desc: string[] | string | undefined): string {
  if (!desc) return '';
  const list = Array.isArray(desc) ? desc : [desc];
  return list
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Стоимость в медных монетах. */
export function toCp(cost: { quantity: number; unit: string } | undefined): number {
  if (!cost) return 0;
  const mult: Record<string, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
  return Math.round(cost.quantity * (mult[cost.unit] ?? 100));
}
