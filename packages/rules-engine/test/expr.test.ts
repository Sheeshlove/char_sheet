import { describe, expect, it } from 'vitest';
import { checkExpr, evalBool, evalExpr, evalNumber, ExprError, parseExpr } from '../src';

const ctx = {
  vars: { STR: 3, DEX: 2, CLASS_LEVEL: 5, LEVEL: 7, ARMOR: 'none', SHIELD: false, PB: 3 },
  col: (n: string) => (n === 'rage_damage' ? 2 : n === 'martial_arts' ? '1d6' : 0),
  toggle: (id: string) => id === 'raging',
  has: (k: string) => k === 'mini/feat/tough',
};

describe('вычислитель выражений (SPEC §6.4)', () => {
  it('арифметика и функции', () => {
    expect(evalNumber('10 + DEX + STR', ctx)).toBe(15);
    expect(evalNumber('floor(CLASS_LEVEL / 2) + 1', ctx)).toBe(3);
    expect(evalNumber('ceil(7 / 2)', ctx)).toBe(4);
    expect(evalNumber('max(1, DEX - 5)', ctx)).toBe(1);
    expect(evalNumber('min(4, PB, 10)', ctx)).toBe(3);
    expect(evalNumber('abs(-4) % 3', ctx)).toBe(1);
    expect(evalNumber('-DEX * 2', ctx)).toBe(-4);
    expect(evalNumber('+DEX', ctx)).toBe(2);
    expect(evalNumber('7', ctx)).toBe(7);
  });
  it('col, toggle, has, сравнения и тернарный оператор', () => {
    expect(evalExpr('col("rage_damage")', ctx)).toBe(2);
    expect(evalExpr('col("martial_arts")', ctx)).toBe('1d6');
    expect(evalBool('toggle("raging") && LEVEL >= 5', ctx)).toBe(true);
    expect(evalBool('toggle("nope") || !SHIELD', ctx)).toBe(true);
    expect(evalBool('has("mini/feat/tough")', ctx)).toBe(true);
    expect(evalExpr('CLASS_LEVEL >= 17 ? 2 : 1', ctx)).toBe(1);
    expect(evalBool('ARMOR == "none"', ctx)).toBe(true);
    expect(evalBool('ARMOR != "heavy"', ctx)).toBe(true);
    expect(evalBool('LEVEL === 7 && LEVEL !== 8 && LEVEL < 8 && LEVEL > 6 && LEVEL <= 7', ctx)).toBe(true);
    expect(evalBool('false || ""', ctx)).toBe(false);
    expect(evalBool('true', ctx)).toBe(true);
  });
  it('запрещённые конструкции и ошибки — ExprError, никакого eval', () => {
    expect(() => parseExpr('a.b')).toThrow(ExprError);
    expect(() => parseExpr('eval("1")')).toThrow(ExprError);
    expect(() => parseExpr('[1, 2]')).toThrow(ExprError);
    expect(() => parseExpr('1 << 2')).toThrow(ExprError);
    expect(() => parseExpr('~1')).toThrow(ExprError);
    expect(() => parseExpr('this')).toThrow(ExprError);
    expect(() => parseExpr('1 +')).toThrow(ExprError);
    expect(() => evalNumber('UNKNOWN + 1', ctx)).toThrow(ExprError);
    expect(() => evalNumber('1 / 0', ctx)).toThrow(ExprError);
    expect(() => evalNumber('1 % 0', ctx)).toThrow(ExprError);
    expect(() => evalNumber('ARMOR + 1', ctx)).toThrow(ExprError);
    expect(() => evalNumber('min()', ctx)).toThrow(ExprError);
    expect(() => evalNumber('max()', ctx)).toThrow(ExprError);
    expect(() => evalExpr('col("x")', { vars: {} })).toThrow(ExprError);
    expect(evalBool('toggle("x")', { vars: {} })).toBe(false);
    expect(evalBool('has("x")', { vars: {} })).toBe(false);
  });
  it('кэширует разбор', () => {
    expect(parseExpr('1 + LEVEL')).toBe(parseExpr('1 + LEVEL'));
  });
});

describe('проверка выражений в редакторе homebrew', () => {
  it('вычисляет на тестовом персонаже 5 уровня и сообщает об ошибках', () => {
    expect(checkExpr('2')).toEqual({ ok: true, value: 2 });
    expect(checkExpr('PB + DEX')).toEqual({ ok: true, value: 5 });
    expect(checkExpr('max(1, floor(LEVEL / 2))')).toEqual({ ok: true, value: 2 });
    expect(checkExpr('col("Ярость")', { Ярость: 3 })).toEqual({ ok: true, value: 3 });
    expect(checkExpr('col("Ярость")').ok).toBe(false);
    expect(checkExpr('PB +').ok).toBe(false);
    expect(checkExpr('alert(1)').ok).toBe(false);
  });
});
