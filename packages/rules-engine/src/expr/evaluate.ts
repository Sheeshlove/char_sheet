import jsep from 'jsep';

/**
 * Вычислитель выражений эффектов (SPEC §6.4). Разбор — `jsep`, вычисление — собственный
 * интерпретатор с белым списком узлов. Никаких `eval` / `new Function`.
 */

export type ExprValue = number | boolean | string;

export type ExprContext = {
  vars: Record<string, ExprValue | undefined>;
  col?: (name: string) => ExprValue;
  toggle?: (id: string) => boolean;
  has?: (key: string) => boolean;
};

export class ExprError extends Error {
  constructor(
    message: string,
    public readonly expr: string,
  ) {
    super(`${message} в выражении «${expr}»`);
    this.name = 'ExprError';
  }
}

const BINARY = new Set(['+', '-', '*', '/', '%', '==', '!=', '===', '!==', '<', '>', '<=', '>=', '&&', '||']);
const UNARY = new Set(['-', '+', '!']);
const FUNCS = new Set(['floor', 'ceil', 'min', 'max', 'abs', 'col', 'toggle', 'has']);

type Node = jsep.Expression;

const cache = new Map<string, Node>();
const MAX_CACHE = 5000;

export function parseExpr(expr: string): Node {
  const hit = cache.get(expr);
  if (hit) return hit;
  let ast: Node;
  try {
    ast = jsep(expr);
  } catch (e) {
    throw new ExprError(e instanceof Error ? e.message : 'Ошибка разбора', expr);
  }
  validate(ast, expr);
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(expr, ast);
  return ast;
}

function validate(node: Node, expr: string): void {
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      return;
    case 'BinaryExpression': {
      const n = node as jsep.BinaryExpression;
      if (!BINARY.has(n.operator)) throw new ExprError(`Оператор ${n.operator} запрещён`, expr);
      validate(n.left, expr);
      validate(n.right, expr);
      return;
    }
    case 'UnaryExpression': {
      const n = node as jsep.UnaryExpression;
      if (!UNARY.has(n.operator)) throw new ExprError(`Оператор ${n.operator} запрещён`, expr);
      validate(n.argument, expr);
      return;
    }
    case 'ConditionalExpression': {
      const n = node as jsep.ConditionalExpression;
      validate(n.test, expr);
      validate(n.consequent, expr);
      validate(n.alternate, expr);
      return;
    }
    case 'CallExpression': {
      const n = node as jsep.CallExpression;
      if (n.callee.type !== 'Identifier' || !FUNCS.has((n.callee as jsep.Identifier).name)) {
        throw new ExprError('Недопустимая функция', expr);
      }
      for (const a of n.arguments) validate(a, expr);
      return;
    }
    default:
      throw new ExprError(`Недопустимая конструкция ${node.type}`, expr);
  }
}

function num(v: ExprValue, expr: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  throw new ExprError(`Ожидалось число, получено «${v}»`, expr);
}

function evalNode(node: Node, ctx: ExprContext, expr: string): ExprValue {
  switch (node.type) {
    case 'Literal': {
      const v = (node as jsep.Literal).value;
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
      throw new ExprError('Недопустимый литерал', expr);
    }
    case 'Identifier': {
      const name = (node as jsep.Identifier).name;
      if (name === 'true') return true;
      if (name === 'false') return false;
      const v = ctx.vars[name];
      if (v === undefined) throw new ExprError(`Неизвестная переменная ${name}`, expr);
      return v;
    }
    case 'UnaryExpression': {
      const n = node as jsep.UnaryExpression;
      const a = evalNode(n.argument, ctx, expr);
      if (n.operator === '!') return !truthy(a);
      if (n.operator === '-') return -num(a, expr);
      return num(a, expr);
    }
    case 'BinaryExpression': {
      const n = node as jsep.BinaryExpression;
      if (n.operator === '&&') {
        const l = evalNode(n.left, ctx, expr);
        return truthy(l) ? truthy(evalNode(n.right, ctx, expr)) : false;
      }
      if (n.operator === '||') {
        const l = evalNode(n.left, ctx, expr);
        return truthy(l) ? true : truthy(evalNode(n.right, ctx, expr));
      }
      const l = evalNode(n.left, ctx, expr);
      const r = evalNode(n.right, ctx, expr);
      switch (n.operator) {
        case '==':
        case '===':
          return l === r || (typeof l !== 'string' && typeof r !== 'string' && num(l, expr) === num(r, expr));
        case '!=':
        case '!==':
          return !(l === r || (typeof l !== 'string' && typeof r !== 'string' && num(l, expr) === num(r, expr)));
        case '+':
          return num(l, expr) + num(r, expr);
        case '-':
          return num(l, expr) - num(r, expr);
        case '*':
          return num(l, expr) * num(r, expr);
        case '/': {
          const d = num(r, expr);
          if (d === 0) throw new ExprError('Деление на ноль', expr);
          return num(l, expr) / d;
        }
        case '%': {
          const d = num(r, expr);
          if (d === 0) throw new ExprError('Деление на ноль', expr);
          return num(l, expr) % d;
        }
        case '<':
          return num(l, expr) < num(r, expr);
        case '>':
          return num(l, expr) > num(r, expr);
        case '<=':
          return num(l, expr) <= num(r, expr);
        case '>=':
          return num(l, expr) >= num(r, expr);
      }
      throw new ExprError(`Оператор ${n.operator}`, expr);
    }
    case 'ConditionalExpression': {
      const n = node as jsep.ConditionalExpression;
      return truthy(evalNode(n.test, ctx, expr)) ? evalNode(n.consequent, ctx, expr) : evalNode(n.alternate, ctx, expr);
    }
    case 'CallExpression': {
      const n = node as jsep.CallExpression;
      const fn = (n.callee as jsep.Identifier).name;
      const args = n.arguments.map((a) => evalNode(a, ctx, expr));
      switch (fn) {
        case 'floor':
          return Math.floor(num(args[0] ?? 0, expr));
        case 'ceil':
          return Math.ceil(num(args[0] ?? 0, expr));
        case 'abs':
          return Math.abs(num(args[0] ?? 0, expr));
        case 'min':
          if (!args.length) throw new ExprError('min() без аргументов', expr);
          return Math.min(...args.map((a) => num(a, expr)));
        case 'max':
          if (!args.length) throw new ExprError('max() без аргументов', expr);
          return Math.max(...args.map((a) => num(a, expr)));
        case 'col': {
          if (!ctx.col) throw new ExprError('col() недоступна для этого источника', expr);
          return ctx.col(String(args[0] ?? ''));
        }
        case 'toggle':
          return ctx.toggle ? ctx.toggle(String(args[0] ?? '')) : false;
        case 'has':
          return ctx.has ? ctx.has(String(args[0] ?? '')) : false;
      }
      throw new ExprError(`Функция ${fn}`, expr);
    }
  }
  throw new ExprError(`Узел ${node.type}`, expr);
}

function truthy(v: ExprValue): boolean {
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}

/** Вычислить выражение. Бросает `ExprError` при ошибке разбора или вычисления. */
export function evalExpr(expr: string, ctx: ExprContext): ExprValue {
  const trimmed = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return evalNode(parseExpr(trimmed), ctx, trimmed);
}

export function evalNumber(expr: string, ctx: ExprContext): number {
  const v = evalExpr(expr, ctx);
  return num(v, expr);
}

export function evalBool(expr: string, ctx: ExprContext): boolean {
  return truthy(evalExpr(expr, ctx));
}
