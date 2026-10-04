import { ABILITIES, parseEntityData, type ClassData, type ContentEntity } from '@ps/content-schema';
import {
  evalExpr,
  pactSlots,
  parseExpr,
  singleClassCasterLevel,
  slotsForCasterLevel,
  type ExprContext,
} from '@ps/rules-engine';
import { effectExprs, effectRefs, forEachEffect } from './walk';

export type ValidationReport = { errors: string[]; warnings: string[]; entities: number };

const TEST_LEVEL = 5;

/** Контекст тестового персонажа 5 уровня для вычисления выражений (SPEC §7.2 content:validate). */
function testContext(entities: Map<string, ContentEntity>, classKey?: string): ExprContext {
  const vars: ExprContext['vars'] = { PB: 3, LEVEL: TEST_LEVEL, CLASS_LEVEL: TEST_LEVEL, SPELL_MOD: 3, ARMOR: 'none', SHIELD: false };
  for (const a of ABILITIES) {
    vars[a.toUpperCase()] = 2;
    vars[`${a.toUpperCase()}_SCORE`] = 14;
  }
  for (const e of entities.values()) if (e.kind === 'class') vars[`LEVEL_${e.slug.replace(/-/g, '_')}`] = TEST_LEVEL;
  const cls = classKey ? (entities.get(classKey)?.data as ClassData | undefined) : undefined;
  return {
    vars,
    col: (name) => {
      if (!cls) throw new Error('col() вне класса');
      const row = cls.levels.find((l) => l.level === TEST_LEVEL);
      const v = row?.values[name];
      if (v === undefined) throw new Error(`нет колонки «${name}»`);
      return typeof v === 'number' ? v : Number.isFinite(Number(String(v).replace(/^\+/, ''))) ? Number(String(v).replace(/^\+/, '')) : String(v);
    },
    toggle: () => false,
    has: () => false,
  };
}

export function validateContent(all: ContentEntity[]): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byKey = new Map<string, ContentEntity>();
  for (const e of all) {
    if (byKey.has(e.key)) errors.push(`Дубликат ключа ${e.key}`);
    byKey.set(e.key, e);
    const r = parseEntityData(e.kind, e.data);
    if (!r.success) errors.push(`${e.key}: схема — ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }

  // Выражения и ссылки
  forEachEffect(all, ({ entity, feature, effect, classKey }) => {
    const where = `${entity.key}${feature ? `#${feature.key}` : ''}`;
    for (const expr of effectExprs(effect)) {
      try {
        parseExpr(expr);
        evalExpr(expr, testContext(byKey, classKey));
      } catch (err) {
        errors.push(`${where}: выражение «${expr}» — ${err instanceof Error ? err.message : err}`);
      }
    }
    for (const ref of effectRefs(effect)) if (!byKey.has(ref)) warnings.push(`${where}: ссылка на отсутствующую сущность ${ref}`);
  });

  for (const e of all) {
    if (e.kind === 'subclass' && !byKey.has(e.data.classKey)) warnings.push(`${e.key}: класс ${e.data.classKey} не найден`);
    if (e.kind === 'subrace' && !byKey.has(e.data.raceKey)) warnings.push(`${e.key}: раса ${e.data.raceKey} не найдена`);
    if (e.kind === 'subclass') {
      for (const g of [...(e.data.alwaysPrepared ?? []), ...(e.data.expandedSpellList ?? [])]) {
        for (const s of g.spells) if (!byKey.has(s)) warnings.push(`${e.key}: заклинание ${s} не найдено`);
      }
    }
    if (e.kind === 'item' && typeof e.data.baseItem === 'string' && !byKey.has(e.data.baseItem)) {
      warnings.push(`${e.key}: базовый предмет ${e.data.baseItem} не найден`);
    }
    // Сверка расчёта ячеек движком с таблицей класса (SPEC §8.9).
    if (e.kind === 'class' && e.data.spellcasting) {
      const sc = e.data.spellcasting;
      for (const row of e.data.levels) {
        const table = Array.from({ length: 9 }, (_, i) => Number(row.values[`slots_${i + 1}`] ?? 0));
        if (!table.some((n) => n > 0) && !Object.keys(row.values).some((k) => k.startsWith('slots_'))) continue;
        let expected: number[];
        if (sc.progression === 'pact') {
          const p = pactSlots(row.level);
          expected = Array.from({ length: 9 }, (_, i) => (i + 1 === p.level ? p.count : 0));
        } else expected = slotsForCasterLevel(singleClassCasterLevel(sc.progression, row.level));
        if (expected.join(',') !== table.join(',')) {
          warnings.push(`${e.key}: ${row.level} ур. — таблица ячеек ${table.join('/')} ≠ расчёт ${expected.join('/')}`);
        }
      }
    }
  }
  return { errors, warnings, entities: all.length };
}
