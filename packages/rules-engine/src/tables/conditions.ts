import { DAMAGE_TYPES, type ConditionId, type Effect } from '@ps/content-schema';

/**
 * Встроенные эффекты состояний (SPEC §8.11). Используются, если в контенте нет сущности
 * `srd/condition/<id>`, и служат эталоном при импорте SRD.
 */
const againstYou = (mode: 'advantage' | 'disadvantage', noteRu: string): Effect => ({
  type: 'roll_mode',
  mode,
  target: 'attacks_against_you',
  noteRu,
});

const ownAttacks = (mode: 'advantage' | 'disadvantage', noteRu: string, conditional = false): Effect => ({
  type: 'roll_mode',
  mode,
  target: 'attack:*',
  noteRu,
  conditional,
});

const speedZero: Effect = { type: 'speed', mode: 'all', op: 'zero' };
const autoFailStrDex: Effect = { type: 'auto_fail', saves: ['str', 'dex'], noteRu: 'Автоматический провал спасбросков Силы и Ловкости' };

export const CONDITION_EFFECTS: Record<Exclude<ConditionId, 'exhaustion'>, { effects: Effect[]; implies?: ConditionId[] }> = {
  blinded: {
    effects: [
      ownAttacks('disadvantage', 'Ослеплён: помеха на свои атаки'),
      againstYou('advantage', 'Атаки по ослеплённому совершаются с преимуществом'),
      { type: 'text', noteRu: 'Автоматически проваливает проверки, требующие зрения' },
    ],
  },
  charmed: {
    effects: [{ type: 'text', noteRu: 'Не может атаковать очарователя; тот совершает с преимуществом социальные проверки' }],
  },
  deafened: { effects: [{ type: 'text', noteRu: 'Автоматически проваливает проверки, требующие слуха' }] },
  frightened: {
    effects: [
      { type: 'roll_mode', mode: 'disadvantage', target: 'check:*', noteRu: 'Испуган: помеха, пока источник страха в поле зрения', conditional: true },
      ownAttacks('disadvantage', 'Испуган: помеха, пока источник страха в поле зрения', true),
    ],
  },
  grappled: { effects: [speedZero, { type: 'text', noteRu: 'Скорость 0' }] },
  incapacitated: { effects: [{ type: 'text', noteRu: 'Не может совершать действия и реакции' }] },
  invisible: {
    effects: [
      ownAttacks('advantage', 'Невидим: преимущество на атаки'),
      againstYou('disadvantage', 'Атаки по невидимому совершаются с помехой'),
    ],
  },
  paralyzed: {
    implies: ['incapacitated'],
    effects: [
      speedZero,
      autoFailStrDex,
      againstYou('advantage', 'Атаки по парализованному совершаются с преимуществом'),
      { type: 'text', noteRu: 'Попадание атакующим в пределах 5 футов — критическое' },
    ],
  },
  petrified: {
    implies: ['incapacitated'],
    effects: [
      speedZero,
      autoFailStrDex,
      againstYou('advantage', 'Атаки по окаменевшему совершаются с преимуществом'),
      ...DAMAGE_TYPES.map((t): Effect => ({ type: 'defense', kind: 'resistance', damageType: t, noteRu: 'Окаменение' })),
      { type: 'defense', kind: 'immunity', damageType: 'poison', noteRu: 'Окаменение' },
      { type: 'condition_immunity', condition: 'poisoned' },
      { type: 'text', noteRu: 'Иммунитет к болезням; яд в организме приостанавливается' },
    ],
  },
  poisoned: {
    effects: [
      ownAttacks('disadvantage', 'Отравлен: помеха на броски атаки'),
      { type: 'roll_mode', mode: 'disadvantage', target: 'check:*', noteRu: 'Отравлен: помеха на проверки характеристик', conditional: false },
    ],
  },
  prone: {
    effects: [
      ownAttacks('disadvantage', 'Сбит с ног: помеха на свои атаки'),
      { type: 'text', noteRu: 'Атаки по вам в пределах 5 футов — с преимуществом, дальше — с помехой' },
    ],
  },
  restrained: {
    effects: [
      speedZero,
      ownAttacks('disadvantage', 'Опутан: помеха на свои атаки'),
      { type: 'roll_mode', mode: 'disadvantage', target: 'save:dex', noteRu: 'Опутан: помеха на спасброски Ловкости', conditional: false },
      againstYou('advantage', 'Атаки по опутанному совершаются с преимуществом'),
    ],
  },
  stunned: {
    implies: ['incapacitated'],
    effects: [speedZero, autoFailStrDex, againstYou('advantage', 'Атаки по ошеломлённому совершаются с преимуществом')],
  },
  unconscious: {
    implies: ['incapacitated', 'prone'],
    effects: [
      speedZero,
      autoFailStrDex,
      againstYou('advantage', 'Атаки по бессознательному совершаются с преимуществом'),
      { type: 'text', noteRu: 'Попадание атакующим в пределах 5 футов — критическое' },
    ],
  },
};

/** Эффекты истощения по уровням (накапливаются). Скорость и хиты — в стадиях расчёта. */
export function exhaustionEffects(level: number): Effect[] {
  const out: Effect[] = [];
  if (level >= 1) {
    out.push({ type: 'roll_mode', mode: 'disadvantage', target: 'check:*', noteRu: 'Истощение 1: помеха на проверки характеристик', conditional: false });
  }
  if (level >= 3) {
    out.push(
      { type: 'roll_mode', mode: 'disadvantage', target: 'attack:*', noteRu: 'Истощение 3: помеха на броски атаки', conditional: false },
      { type: 'roll_mode', mode: 'disadvantage', target: 'save:*', noteRu: 'Истощение 3: помеха на спасброски', conditional: false },
    );
  }
  return out;
}
