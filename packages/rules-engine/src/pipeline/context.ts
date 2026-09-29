import type {
  Ability,
  ArmorData,
  CampaignSettings,
  CharacterBuild,
  CharacterState,
  ClassData,
  ConditionId,
  ContentEntity,
  Effect,
  EffectOf,
  Feature,
  InventoryItem,
  MagicItemData,
  Predicate,
  WeaponData,
} from '@ps/content-schema';
import { ABILITIES } from '@ps/content-schema';
import type { ContentIndex } from '../content-index';
import { evalBool, evalExpr, evalNumber, ExprError, type ExprContext, type ExprValue } from '../expr/evaluate';
import type { ChoiceInfo, Issue, RollModeInfo, Val, ValPart } from '../types';

/** Контекст источника эффекта: откуда он и в рамках какого класса считается. */
export type SourceCtx = {
  sourceKey: string;
  sourceLabelRu: string;
  featureKey: string;
  featureNameRu?: string;
  /** Класс-источник (для `CLASS_LEVEL`, `col()`, `SPELL_MOD`). У подкласса — его класс. */
  classKey?: string;
  level?: number;
};

export type AppliedEffect = { effect: Effect; src: SourceCtx };

export type Source = {
  sourceKey: string;
  sourceLabelRu: string;
  kind: 'race' | 'subrace' | 'background' | 'class' | 'subclass' | 'feat' | 'item' | 'condition' | 'manual' | 'feature' | 'system';
  classKey?: string;
  features: Feature[];
  /** Не показывать в списке умений (служебные источники). */
  hiddenInList?: boolean;
};

export type WornArmor = {
  itemId: string;
  nameRu: string;
  data: ArmorData;
  magicBonus: number;
  entityKey?: string;
};

export type WieldedWeapon = {
  itemId: string;
  nameRu: string;
  data: WeaponData;
  magicBonus: number;
  magicDamageBonus: number;
  hand?: 'main' | 'off' | 'both';
  entityKey?: string;
  baseSlug?: string;
};

export type Equipment = {
  body: WornArmor[];
  shields: WornArmor[];
  weapons: WieldedWeapon[];
  /** Надетые/настроенные магические предметы, чьи эффекты действуют. */
  activeItems: { item: InventoryItem; entity: ContentEntity<'item'> }[];
  armorCategory: 'none' | 'light' | 'medium' | 'heavy';
  hasShield: boolean;
};

export type AbilityState = Record<Ability, { score: number; mod: number; scoreVal: Val }>;

export type AttackEvalCtx = {
  ability: Ability;
  weapon?: WieldedWeapon;
  unarmed?: boolean;
  ranged?: boolean;
};

export class Pipeline {
  readonly issues: Issue[] = [];
  readonly sources: Source[] = [];
  readonly effects: AppliedEffect[] = [];
  readonly choices: ChoiceInfo[] = [];
  /** Выборы заклинаний по ключу выбора (для `spell_grant { choice }`). */
  readonly choiceSelections = new Map<string, string[]>();
  readonly toggleDefs: { effect: EffectOf<'toggle'>; src: SourceCtx }[] = [];
  readonly rollModes: RollModeInfo[] = [];
  readonly classLevels = new Map<string, number>();
  readonly customLanguages = new Set<string>();
  activeConditions: ConditionId[] = [];
  profs = new Map<string, 'proficient' | 'expertise'>();
  cannotCast = false;
  readonly subclassOf = new Map<string, string>();
  totalLevel = 0;
  equipment!: Equipment;
  abilities?: AbilityState;
  pb = 2;
  private seenEffectIds = new Set<string>();
  private warnedExpr = new Set<string>();
  private exprCtxCache = new Map<string, ExprContext>();

  constructor(
    readonly build: CharacterBuild,
    readonly state: CharacterState,
    readonly content: ContentIndex,
    readonly rules: CampaignSettings,
  ) {}

  // ─── Эффекты ───────────────────────────────────────────────────────────

  /** Регистрирует эффект; одинаковые (sourceKey + featureKey + id) применяются один раз. */
  pushEffect(effect: Effect, src: SourceCtx): boolean {
    if (effect.id) {
      const k = `${src.sourceKey}#${src.featureKey}#${effect.type}#${effect.id}`;
      if (this.seenEffectIds.has(k)) return false;
      this.seenEffectIds.add(k);
    }
    this.effects.push({ effect, src });
    return true;
  }

  ofType<T extends Effect['type']>(type: T): { effect: EffectOf<T>; src: SourceCtx }[] {
    return this.effects.filter((a) => a.effect.type === type) as { effect: EffectOf<T>; src: SourceCtx }[];
  }

  /** Эффекты типа, у которых выполнено `when` (вне контекста атаки). */
  active<T extends Effect['type']>(type: T): { effect: EffectOf<T>; src: SourceCtx }[] {
    return this.ofType(type).filter((a) => this.check(a.effect.when, a.src));
  }

  // ─── Выражения ─────────────────────────────────────────────────────────

  classData(classKey: string | undefined): ClassData | undefined {
    if (!classKey) return undefined;
    return this.content.getOf(classKey, 'class')?.data;
  }

  classLevel(classKey: string | undefined): number {
    return classKey ? (this.classLevels.get(classKey) ?? 0) : 0;
  }

  spellcastingAbility(classKey: string | undefined): Ability | undefined {
    if (!classKey) return undefined;
    const cls = this.classData(classKey);
    if (cls?.spellcasting) return cls.spellcasting.ability;
    const sub = this.subclassOf.get(classKey);
    const subData = sub ? this.content.getOf(sub, 'subclass')?.data : undefined;
    return subData?.spellcasting?.ability;
  }

  colValue(classKey: string | undefined, name: string): ExprValue {
    const cls = this.classData(classKey);
    if (!cls) throw new Error(`col("${name}"): нет класса-источника`);
    const lvl = Math.max(1, Math.min(20, this.classLevel(classKey)));
    const row = cls.levels.find((l) => l.level === lvl);
    const v = row?.values[name];
    if (v === undefined) throw new Error(`col("${name}"): нет колонки`);
    if (typeof v === 'number') return v;
    const n = Number(v.replace(/^\+/, ''));
    if (v.trim() !== '' && Number.isFinite(n)) return n;
    if (v.trim() === '—' || v.trim() === '-' || v.trim() === '') return 0;
    return v.replace(/к/giu, 'd');
  }

  exprCtx(src?: Pick<SourceCtx, 'classKey'>, attack?: AttackEvalCtx): ExprContext {
    const classKey = src?.classKey;
    const cacheKey = attack ? '' : (classKey ?? '-');
    if (!attack && this.abilities) {
      const hit = this.exprCtxCache.get(cacheKey);
      if (hit) return hit;
    }
    const vars: Record<string, ExprValue> = {};
    const scores = this.currentScores();
    for (const a of ABILITIES) {
      vars[a.toUpperCase()] = Math.floor((scores[a] - 10) / 2);
      vars[`${a.toUpperCase()}_SCORE`] = scores[a];
    }
    vars.PB = this.pb;
    vars.LEVEL = this.totalLevel;
    vars.CLASS_LEVEL = classKey ? this.classLevel(classKey) : this.totalLevel;
    for (const [k, lvl] of this.classLevels) {
      const slug = k.split('/').pop()!.replace(/-/g, '_');
      vars[`LEVEL_${slug}`] = lvl;
    }
    const sa = this.spellcastingAbility(classKey);
    vars.SPELL_MOD = sa ? (vars[sa.toUpperCase()] as number) : 0;
    vars.ARMOR = this.equipment?.armorCategory ?? 'none';
    vars.SHIELD = this.equipment?.hasShield ?? false;
    const ctx: ExprContext = {
      vars,
      col: (name) => this.colValue(classKey, name),
      toggle: (id) => this.state.toggles.includes(id),
      has: (key) => this.hasSource(key),
    };
    if (!attack && this.abilities) this.exprCtxCache.set(cacheKey, ctx);
    return ctx;
  }

  invalidateExprCache() {
    this.exprCtxCache.clear();
  }

  currentScores(): Record<Ability, number> {
    if (this.abilities) {
      return Object.fromEntries(ABILITIES.map((a) => [a, this.abilities![a].score])) as Record<Ability, number>;
    }
    return this.build.abilities.base;
  }

  hasSource(key: string): boolean {
    if (this.sources.some((s) => s.sourceKey === key)) return true;
    return this.state.inventory.some((i) => i.key === key && i.equipped);
  }

  private warnExpr(expr: string, err: unknown, src?: SourceCtx) {
    const k = `${src?.sourceKey ?? ''}|${expr}`;
    if (this.warnedExpr.has(k)) return;
    this.warnedExpr.add(k);
    this.issues.push({
      severity: 'warning',
      code: 'expr_error',
      messageRu: `${src ? `${src.sourceLabelRu}: ` : ''}${err instanceof Error ? err.message : String(err)}`,
    });
  }

  /** Число из выражения; ошибка → 0 и предупреждение (SPEC §6.4). */
  num(expr: string | number | undefined, src?: SourceCtx, attack?: AttackEvalCtx): number {
    if (expr === undefined) return 0;
    if (typeof expr === 'number') return expr;
    try {
      return evalNumber(expr, this.exprCtx(src, attack));
    } catch (e) {
      this.warnExpr(expr, e, src);
      return 0;
    }
  }

  /** Кость (`1d6`, `1к6`) или выражение, возвращающее кость/число. */
  dice(expr: string | undefined, src?: SourceCtx): ExprValue | undefined {
    if (expr === undefined) return undefined;
    const t = expr.trim().replace(/к/giu, 'd');
    if (/^\d*d\d+$/i.test(t)) return t;
    const v = this.value(expr, src);
    return typeof v === 'string' ? v.replace(/к/giu, 'd') : v;
  }

  value(expr: string, src?: SourceCtx): ExprValue | undefined {
    try {
      return evalExpr(expr, this.exprCtx(src));
    } catch (e) {
      this.warnExpr(expr, e, src);
      return undefined;
    }
  }

  // ─── Предикаты ─────────────────────────────────────────────────────────

  check(pred: Predicate | undefined, src?: SourceCtx, attack?: AttackEvalCtx): boolean {
    if (pred === undefined) return true;
    if (typeof pred === 'string') {
      try {
        return evalBool(pred, this.exprCtx(src, attack));
      } catch (e) {
        this.warnExpr(pred, e instanceof ExprError ? e : e, src);
        return false;
      }
    }
    if ('all' in pred) return pred.all.every((p) => this.check(p, src, attack));
    if ('any' in pred) return pred.any.some((p) => this.check(p, src, attack));
    if ('not' in pred) return !this.check(pred.not, src, attack);
    if ('toggle' in pred) return this.state.toggles.includes(pred.toggle);
    if ('shield' in pred) return (this.equipment?.hasShield ?? false) === pred.shield;
    if ('armor' in pred) {
      const cat = this.equipment?.armorCategory ?? 'none';
      switch (pred.armor) {
        case 'any':
          return cat !== 'none';
        case 'not_heavy':
          return cat !== 'heavy';
        default:
          return cat === pred.armor;
      }
    }
    if ('attackAbility' in pred) return attack?.ability === pred.attackAbility;
    if ('wielding' in pred) return this.checkWielding(pred.wielding, attack);
    return false;
  }

  private checkWielding(w: Extract<Predicate, { wielding: string }>['wielding'], attack?: AttackEvalCtx): boolean {
    const weapons = this.equipment?.weapons ?? [];
    const wpn = attack?.weapon;
    switch (w) {
      case 'one_melee_weapon_no_other': {
        const ok = weapons.length === 1 && weapons[0]!.data.range === 'melee' && weapons[0]!.hand !== 'both';
        if (!ok) return false;
        return attack ? wpn?.itemId === weapons[0]!.itemId : true;
      }
      case 'two_weapons':
        return weapons.length >= 2;
      case 'ranged_weapon':
        return attack ? !!wpn && wpn.data.range === 'ranged' : weapons.some((x) => x.data.range === 'ranged');
      case 'heavy_weapon':
        return attack ? !!wpn?.data.properties.includes('heavy') : weapons.some((x) => x.data.properties.includes('heavy'));
      case 'finesse_or_ranged': {
        const f = (x: WieldedWeapon) => x.data.properties.includes('finesse') || x.data.range === 'ranged';
        return attack ? !!wpn && f(wpn) : weapons.some(f);
      }
    }
  }
}

// ─── Val ───────────────────────────────────────────────────────────────────

export function makeVal(parts: ValPart[]): Val {
  const filtered = parts.filter((p, i) => p.value !== 0 || i === 0);
  return { value: parts.reduce((s, p) => s + p.value, 0), parts: filtered };
}

export function choiceKey(src: Pick<SourceCtx, 'sourceKey' | 'featureKey'>, effectId: string): string {
  return `${src.sourceKey}#${src.featureKey}#${effectId}`;
}

export type { MagicItemData, WeaponData, ContentEntity };
