import {
  ABILITIES,
  emptyState,
  type Ability,
  type CampaignSettings,
  type CharacterBuild,
  type MulticlassRequirement,
} from '@ps/content-schema';
import type { ContentIndex } from '../content-index';
import { computeWithPipeline } from '../compute';
import { ABILITY_SHORT_RU, POINT_BUY_BUDGET, pointBuyCost, rollTotal, STANDARD_ARRAY } from '../tables/abilities';
import { casterClasses, classSpellPool } from '../pipeline/spellcasting';
import type { Issue } from '../types';

/** Выполнено ли требование мультикласса при данных значениях характеристик. */
export function meetsMulticlass(req: MulticlassRequirement, scores: Record<Ability, number>): boolean {
  const all = req.all ?? [];
  const any = req.any ?? [];
  if (!all.every(([a, n]) => scores[a] >= n)) return false;
  if (any.length && !any.some(([a, n]) => scores[a] >= n)) return false;
  return true;
}

export function describeRequirement(req: MulticlassRequirement): string {
  const all = (req.all ?? []).map(([a, n]) => `${ABILITY_SHORT_RU[a]} ${n}`).join(' и ');
  const any = (req.any ?? []).map(([a, n]) => `${ABILITY_SHORT_RU[a]} ${n}`).join(' или ');
  return [all, any].filter(Boolean).join('; ');
}

const err = (code: string, messageRu: string, path?: string): Issue => ({ severity: 'error', code, messageRu, path });
const warn = (code: string, messageRu: string, path?: string): Issue => ({ severity: 'warning', code, messageRu, path });

/** Проверка сборки (SPEC §8.1): ошибки блокируют «Готово», предупреждения — нет. */
export function validateBuild(build: CharacterBuild, content: ContentIndex, rules: CampaignSettings): Issue[] {
  const issues: Issue[] = [];
  if (!build.identity.name.trim()) issues.push(err('name_required', 'Укажите имя персонажа.', 'identity.name'));

  const race = content.getOf(build.race, 'race');
  if (!build.race) issues.push(err('race_required', 'Выберите расу.', 'race'));
  else if (!race) issues.push(err('race_missing', 'Раса не найдена в разрешённом контенте.', 'race'));
  if (race?.data.subraceRequired && !build.subrace) issues.push(err('subrace_required', 'Выберите подрасу.', 'subrace'));
  if (build.subrace) {
    const sub = content.getOf(build.subrace, 'subrace');
    if (!sub) issues.push(err('subrace_missing', 'Подраса не найдена.', 'subrace'));
    else if (sub.data.raceKey !== build.race) issues.push(err('subrace_mismatch', 'Подраса не относится к выбранной расе.', 'subrace'));
  }
  if (!build.background) issues.push(err('background_required', 'Выберите предысторию.', 'background'));
  else if (!content.getOf(build.background, 'background')) issues.push(err('background_missing', 'Предыстория не найдена.', 'background'));

  if (!build.classes.length || !build.levels.length) issues.push(err('class_required', 'Выберите класс.', 'classes'));
  if (build.levels.length > 20) issues.push(err('level_max', 'Больше 20 уровней.', 'levels'));
  if (build.classes[0] && build.levels[0] && build.levels[0].classKey !== build.classes[0].classKey) {
    issues.push(err('first_class', 'Первый уровень должен быть в стартовом классе.', 'levels.0'));
  }
  const classKeys = new Set(build.classes.map((c) => c.classKey));
  if (classKeys.size !== build.classes.length) issues.push(err('class_duplicate', 'Класс указан дважды.', 'classes'));
  build.levels.forEach((l, i) => {
    if (!classKeys.has(l.classKey)) issues.push(err('level_class', `Уровень ${i + 1}: класс не выбран.`, `levels.${i}`));
  });
  for (const c of build.classes) {
    const cls = content.getOf(c.classKey, 'class');
    if (!cls) {
      issues.push(err('class_missing', `Класс не найден: ${c.classKey}`, 'classes'));
      continue;
    }
    if (c.subclassKey) {
      const sc = content.getOf(c.subclassKey, 'subclass');
      if (!sc) issues.push(err('subclass_missing', 'Подкласс не найден.', 'classes'));
      else if (sc.data.classKey !== c.classKey) issues.push(err('subclass_mismatch', 'Подкласс от другого класса.', 'classes'));
      const lvl = build.levels.filter((l) => l.classKey === c.classKey).length;
      if (lvl < cls.data.subclassLevel) {
        issues.push(warn('subclass_early', `${cls.nameRu}: подкласс выбирается с ${cls.data.subclassLevel} уровня.`, 'classes'));
      }
    }
  }

  // Характеристики
  const base = build.abilities.base;
  const values = ABILITIES.map((a) => base[a]);
  const method = build.abilities.method;
  if (!rules.abilityMethods.includes(method)) {
    issues.push(err('ability_method', 'Этот способ определения характеристик не разрешён мастером.', 'abilities.method'));
  }
  if (method === 'standard_array') {
    const sorted = [...values].sort((a, b) => b - a);
    if (sorted.join(',') !== [...STANDARD_ARRAY].join(',')) {
      issues.push(err('standard_array', 'Значения должны быть стандартным набором 15, 14, 13, 12, 10, 8.', 'abilities'));
    }
  } else if (method === 'point_buy') {
    const cost = pointBuyCost(base);
    if (cost === null) issues.push(err('point_buy_range', 'При покупке значения только от 8 до 15.', 'abilities'));
    else if (cost > POINT_BUY_BUDGET) issues.push(err('point_buy_budget', `Потрачено ${cost} очков из ${POINT_BUY_BUDGET}.`, 'abilities'));
  } else if (method === 'roll') {
    if (values.some((v) => v < 3 || v > 18)) issues.push(err('roll_range', 'Выброшенные значения — от 3 до 18.', 'abilities'));
    if (build.abilities.rolls?.length) {
      const totals = build.abilities.rolls.map(rollTotal).sort((a, b) => a - b).join(',');
      if (totals !== [...values].sort((a, b) => a - b).join(',')) {
        issues.push(err('roll_mismatch', 'Значения не совпадают с результатами бросков.', 'abilities'));
      }
    }
  }

  // Уровни: ASI, хиты, черты
  const running = new Map<string, number>();
  build.levels.forEach((l, i) => {
    const n = (running.get(l.classKey) ?? 0) + 1;
    running.set(l.classKey, n);
    const cls = content.getOf(l.classKey, 'class');
    if (l.asi) {
      if (cls && !cls.data.asiLevels.includes(n)) {
        issues.push(err('asi_level', `Уровень ${i + 1}: на ${n} уровне ${cls.nameRu} нет увеличения характеристик.`, `levels.${i}.asi`));
      }
      if (l.asi.kind === 'asi') {
        const sum = Object.values(l.asi.increases).reduce((s, v) => s + (v ?? 0), 0);
        if (sum !== 2) issues.push(err('asi_sum', `Уровень ${i + 1}: нужно распределить ровно 2 очка.`, `levels.${i}.asi`));
      } else {
        if (!rules.featsAllowed) issues.push(err('feats_disabled', 'Черты запрещены мастером.', `levels.${i}.asi`));
        if (!content.getOf(l.asi.featKey, 'feat')) issues.push(err('feat_missing', 'Черта не найдена.', `levels.${i}.asi`));
      }
    }
    if (cls && l.hp.method === 'roll' && l.hp.roll !== undefined && (l.hp.roll < 1 || l.hp.roll > cls.data.hitDie)) {
      issues.push(err('hp_roll', `Уровень ${i + 1}: бросок хитов вне диапазона 1–${cls.data.hitDie}.`, `levels.${i}.hp`));
    }
    if (i > 0 && rules.hpMethod === 'average' && l.hp.method === 'roll') {
      issues.push(warn('hp_method', `Уровень ${i + 1}: мастер установил среднее значение хитов.`, `levels.${i}.hp`));
    }
    if (i > 0 && rules.hpMethod === 'roll' && l.hp.method === 'average') {
      issues.push(warn('hp_method', `Уровень ${i + 1}: мастер установил бросок хитов.`, `levels.${i}.hp`));
    }
  });

  // Расчёт для проверок, зависящих от итоговых значений
  if (build.levels.length && build.classes.length) {
    const { sheet, pipeline: p } = computeWithPipeline(build, emptyState(), content, rules);
    const scores = Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities[a].score.value])) as Record<Ability, number>;

    if (build.classes.length > 1) {
      if (!rules.multiclassAllowed) issues.push(err('multiclass_disabled', 'Мультикласс запрещён мастером.', 'classes'));
      for (const c of build.classes) {
        const cls = content.getOf(c.classKey, 'class');
        if (cls && !meetsMulticlass(cls.data.multiclassRequirement, scores)) {
          issues.push(
            err('multiclass_req', `${cls.nameRu}: требование мультикласса — ${describeRequirement(cls.data.multiclassRequirement)}.`, 'classes'),
          );
        }
      }
    }
    if (!rules.featsAllowed && p.sources.some((s) => s.kind === 'feat')) {
      issues.push(err('feats_disabled', 'Черты запрещены мастером.', 'choices'));
    }
    for (const s of p.sources) {
      if (s.kind !== 'feat') continue;
      const feat = content.getOf(s.sourceKey.split('~')[0]!, 'feat');
      const check = feat?.data.prerequisite?.check;
      if (feat && check !== undefined && !p.check(check)) {
        issues.push(warn('feat_prereq', `${feat.nameRu}: не выполнено требование «${feat.data.prerequisite!.textRu}».`, 'choices'));
      }
    }

    // Заклинания
    for (const c of casterClasses(p)) {
      const known = build.knownSpells.find((k) => k.classKey === c.classKey);
      if (!known) continue;
      const sc = sheet.spellcasting.classes.find((x) => x.classKey === c.classKey)!;
      const pool = classSpellPool(p, c);
      if (sc.cantripsMax !== undefined && known.cantrips.length > sc.cantripsMax) {
        issues.push(err('too_many_cantrips', `${c.nameRu}: заговоров больше, чем ${sc.cantripsMax}.`, 'knownSpells'));
      }
      if (sc.knownMax !== undefined && known.spells.length > sc.knownMax) {
        issues.push(err('too_many_known', `${c.nameRu}: известных заклинаний больше, чем ${sc.knownMax}.`, 'knownSpells'));
      }
      const all = [...known.cantrips, ...known.spells, ...(known.spellbook ?? [])];
      for (const k of all) {
        const s = content.getOf(k, 'spell');
        if (!s) continue;
        if (!pool.has(k)) issues.push(warn('spell_not_in_list', `${s.nameRu} нет в списке заклинаний класса ${c.nameRu}.`, 'knownSpells'));
        if (s.data.level > sc.maxSpellLevel) {
          issues.push(err('spell_level', `${s.nameRu}: ${s.data.level} круг недоступен (максимум ${sc.maxSpellLevel}).`, 'knownSpells'));
        }
      }
      const sr = c.sc.schoolRestriction;
      if (sr) {
        const free = sr.freePicksAtLevels.filter((l) => l <= c.level).length;
        const outside = known.spells.filter((k) => {
          const s = content.getOf(k, 'spell');
          return s && !sr.schools.includes(s.data.school);
        }).length;
        if (outside > free) {
          issues.push(warn('school_restriction', `${c.nameRu}: вне разрешённых школ ${outside} заклинаний, допускается ${free}.`, 'knownSpells'));
        }
      }
    }

    // RULES-NOTE: незавершённые выборы — предупреждения, «Готово» блокируют только ошибки.
    for (const c of sheet.pendingChoices) {
      issues.push(warn('pending_choice', `Не завершён выбор: ${c.labelRu} (${c.selected.length}/${c.choose}).`, `choices.${c.key}`));
    }
    for (const i of sheet.issues) if (!issues.some((x) => x.code === i.code && x.messageRu === i.messageRu)) issues.push(i);
  }
  return issues;
}
