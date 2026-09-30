import { ABILITIES } from '@ps/content-schema';
import { evalExpr, parseExpr, type ExprContext, type ExprValue } from './evaluate';

/** Уровень тестового персонажа для проверки выражений (как в `content:validate`). */
export const PREVIEW_LEVEL = 5;

/**
 * Контекст тестового персонажа 5 уровня: БМ +3, все модификаторы +2 (значения 14),
 * модификатор заклинаний +3, без доспеха и щита. Колонки класса — из `columns`, если заданы.
 */
export function previewExprContext(columns?: Record<string, string | number>): ExprContext {
  const vars: ExprContext['vars'] = { PB: 3, LEVEL: PREVIEW_LEVEL, CLASS_LEVEL: PREVIEW_LEVEL, SPELL_MOD: 3, ARMOR: 'none', SHIELD: false };
  for (const a of ABILITIES) {
    vars[a.toUpperCase()] = 2;
    vars[`${a.toUpperCase()}_SCORE`] = 14;
  }
  return {
    vars,
    col: (name) => {
      const v = columns?.[name];
      if (v === undefined) throw new Error(`нет колонки «${name}»`);
      return v;
    },
    toggle: () => false,
    has: () => false,
  };
}

/** Проверка выражения эффекта: разбор и вычисление на тестовом персонаже. */
export function checkExpr(expr: string, columns?: Record<string, string | number>): { ok: true; value: ExprValue } | { ok: false; error: string } {
  try {
    parseExpr(expr);
    return { ok: true, value: evalExpr(expr, previewExprContext(columns)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
