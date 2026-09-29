/** Минимальный разбор robots.txt: группы User-agent, Allow/Disallow, Crawl-delay. */
export type RobotsRules = {
  isAllowed(path: string): boolean;
  crawlDelayMs?: number;
};

type Rule = { allow: boolean; pattern: string };

function toRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/**
 * Правила для нашего агента: группа с совпадающим токеном User-agent, иначе `*`.
 * Побеждает самое длинное совпавшее правило; при равенстве — Allow (RFC 9309).
 */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  const groups: { agents: string[]; rules: Rule[]; delay?: number }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      if (value) current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) current.delay = n * 1000;
    }
  }
  const token = userAgent.split('/')[0]!.toLowerCase();
  const group =
    groups.find((g) => g.agents.some((a) => a !== '*' && token.includes(a))) ?? groups.find((g) => g.agents.includes('*'));
  const rules = group?.rules ?? [];
  return {
    crawlDelayMs: group?.delay,
    isAllowed(path: string) {
      let best: Rule | null = null;
      for (const r of rules) {
        if (!toRegExp(r.pattern).test(path)) continue;
        if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) {
          best = r;
        }
      }
      return best ? best.allow : true;
    },
  };
}
