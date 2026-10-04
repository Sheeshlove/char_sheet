import type { Ability, Effect, Size } from '@ps/content-schema';
import { findTerm, findTermIds, norm, parseCount, type TermDictionary } from '../terms';

/**
 * «Значение вашего Телосложения увеличивается на 2», «…а значение вашей Харизмы увеличивается на 1»,
 * «Значения двух других ваших характеристик на ваш выбор увеличиваются на 1», «Значение всех ваших
 * характеристик увеличивается на 1».
 */
export function parseAsi(text: string | undefined, dict?: TermDictionary): Effect[] | null {
  if (!text) return null;
  const effects: Effect[] = [];
  const t = norm(text);
  if (/значени\S*\s+всех\s+ваших\s+характеристик\s+увеличива\S*\s+на\s+(\d)/.test(t)) {
    const n = /значени\S*\s+всех\s+ваших\s+характеристик\s+увеличива\S*\s+на\s+(\d)/.exec(t)![1]!;
    for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[]) {
      effects.push({ type: 'ability', ability: a, op: 'add', value: n });
    }
    return effects;
  }
  for (const m of text.matchAll(/значени\S*\s+(?:вашего\s+|вашей\s+)?(\p{L}+)\s+увеличива\S*\s+на\s+(\d)/giu)) {
    const a = findTerm('abilities', m[1]!, dict) as Ability | undefined;
    if (a) effects.push({ type: 'ability', ability: a, op: 'add', value: m[2]! });
  }
  const choice = /значени\S*\s+(\p{L}+)\s+(?:других\s+)?(?:ваших\s+)?характеристик\S*\s+(?:на\s+ваш\s+выбор\s+)?увеличива\S*\s+на\s+(\d)/iu.exec(
    text,
  );
  if (choice) {
    const count = parseCount(choice[1]!);
    if (count) {
      const exclude = effects.flatMap((e) => (e.type === 'ability' ? [e.ability] : []));
      effects.push({
        type: 'choice',
        id: 'asi',
        labelRu: 'Увеличение характеристик',
        choose: count,
        options: {
          kind: 'ability_increase',
          points: count * Number(choice[2]),
          maxPerAbility: Number(choice[2]),
          ...(exclude.length
            ? { abilities: (['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[]).filter((a) => !exclude.includes(a)) }
            : {}),
        },
      });
    }
  }
  return effects.length ? effects : null;
}

/** «Ваша базовая скорость ходьбы составляет 30 футов» (+ плавание/лазание/полёт). */
export function parseSpeed(text: string | undefined): { walk: number; fly?: number; swim?: number; climb?: number } | null {
  if (!text) return null;
  const t = norm(text);
  const walk = /скорость\s+(?:ходьбы\s+)?(?:составляет|равна)\s+(\d+)\s*фут/.exec(t) ?? /(\d+)\s*фут/.exec(t);
  if (!walk) return null;
  const out: { walk: number; fly?: number; swim?: number; climb?: number } = { walk: Number(walk[1]) };
  const mode = (re: RegExp) => {
    const m = re.exec(t);
    return m ? Number(m[1]) : undefined;
  };
  const swim = mode(/скорость\S*\s+плавани\S*\s+(?:составляет\s+|равн\S+\s+)?(\d+)/);
  const climb = mode(/скорость\S*\s+лазани\S*\s+(?:составляет\s+|равн\S+\s+)?(\d+)/);
  const fly = mode(/скорость\S*\s+полет\S*\s+(?:составляет\s+|равн\S+\s+)?(\d+)/);
  if (swim) out.swim = swim;
  if (climb) out.climb = climb;
  if (fly) out.fly = fly;
  return out;
}

/** «Вы относитесь к Среднему размеру» / «Ваш размер — Маленький». */
export function parseSize(text: string | undefined, dict?: TermDictionary): Size | null {
  if (!text) return null;
  const idx = norm(text).search(/размер/);
  const tail = idx >= 0 ? text.slice(idx) : text;
  const sizes = findTermIds('sizes', tail, dict);
  return sizes.length === 1 ? (sizes[0] as Size) : null;
}

/** Тёмное зрение «в пределах 60 футов». */
export function parseDarkvision(text: string | undefined): number | null {
  if (!text) return null;
  const m = /в\s+пределах\s+(\d+)\s*фут/i.exec(text);
  return m ? Number(m[1]) : null;
}

/** Языки: известные id + «ещё один язык на ваш выбор». */
export function parseLanguages(text: string | undefined, dict?: TermDictionary): { known: string[]; choose: number } {
  if (!text) return { known: [], choose: 0 };
  const known = findTermIds('languages', text, dict);
  const c = /(?:ещё|еще|и)\s+(\p{L}+|\d+)\s+(?:другом\s+|другой\s+|других\s+|дополнительн\S*\s+)?язык\S*\s+на\s+ваш\s+выбор/iu.exec(
    text,
  );
  const choose = c ? (parseCount(c[1]!) ?? 0) : 0;
  return { known, choose };
}
