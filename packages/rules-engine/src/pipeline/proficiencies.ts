import type { Effect } from '@ps/content-schema';
import { ARMOR_CATEGORY_LABEL_RU } from '../tables/labels';
import type { Pipeline, SourceCtx } from './context';
import { weaponProfLabel } from './collect';

/** Стадия 5: владения (спасброски — только от первого класса, см. collect.classProficiencyFeature). */
export function computeProficiencies(p: Pipeline) {
  const profs = new Map<string, 'proficient' | 'expertise'>();
  for (const { effect } of p.active('proficiency')) {
    const prev = profs.get(effect.target);
    if (prev !== 'expertise') profs.set(effect.target, effect.level);
  }
  p.profs = profs;

  const armor: string[] = [];
  const weapons: string[] = [];
  const tools: string[] = [];
  const languages: string[] = [];
  for (const [target, level] of profs) {
    const [kind, id = ''] = target.split(':');
    if (kind === 'armor') armor.push(ARMOR_CATEGORY_LABEL_RU[id] ?? id);
    else if (kind === 'weapon') weapons.push(weaponProfLabel(p, id));
    else if (kind === 'tool') {
      const name = p.content.bySlug('tool', id)?.nameRu ?? id;
      tools.push(level === 'expertise' ? `${name} (компетентность)` : name);
    }
    else if (kind === 'language') languages.push(p.content.bySlug('language', id)?.nameRu ?? id);
  }
  for (const l of p.customLanguages) languages.push(l);

  // RULES-NOTE: доспех или щит без владения — помехи Сил/Лов и запрет заклинаний.
  // Доспех без владения: помеха на проверки, спасброски и атаки Сил/Лов, нельзя колдовать (SPEC §8.6).
  const eq = p.equipment;
  const lacking = [
    ...eq.body.filter((a) => !profs.has(`armor:${a.data.category}`)),
    ...eq.shields.filter(() => !profs.has('armor:shield')),
  ];
  if (lacking.length) {
    const names = lacking.map((a) => a.nameRu).join(', ');
    p.issues.push({
      severity: 'warning',
      code: 'armor_not_proficient',
      messageRu: `Нет владения: ${names}. Помеха на проверки, спасброски и атаки Силы и Ловкости; нельзя накладывать заклинания.`,
    });
    const src: SourceCtx = { sourceKey: 'system/armor', sourceLabelRu: 'Доспех без владения', featureKey: 'armor' };
    const note = 'Доспех без владения';
    const effects: Effect[] = [
      { type: 'roll_mode', mode: 'disadvantage', target: 'check:str', noteRu: note, conditional: false },
      { type: 'roll_mode', mode: 'disadvantage', target: 'check:dex', noteRu: note, conditional: false },
      { type: 'roll_mode', mode: 'disadvantage', target: 'save:str', noteRu: note, conditional: false },
      { type: 'roll_mode', mode: 'disadvantage', target: 'save:dex', noteRu: note, conditional: false },
      { type: 'roll_mode', mode: 'disadvantage', target: 'attack:*', noteRu: `${note} (атаки Силой и Ловкостью)`, conditional: false },
    ];
    for (const e of effects) p.pushEffect(e, src);
    p.cannotCast = true;
  }

  const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'ru'));
  return { armor: uniq(armor), weapons: uniq(weapons), tools: uniq(tools), languages: uniq(languages) };
}
