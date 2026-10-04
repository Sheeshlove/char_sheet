import type { ConditionId, DamageType, SkillId } from '@ps/content-schema';

export const SKILL_LABEL_RU: Record<SkillId, string> = {
  acrobatics: 'Акробатика',
  animal_handling: 'Уход за животными',
  arcana: 'Магия',
  athletics: 'Атлетика',
  deception: 'Обман',
  history: 'История',
  insight: 'Проницательность',
  intimidation: 'Запугивание',
  investigation: 'Анализ',
  medicine: 'Медицина',
  nature: 'Природа',
  perception: 'Внимательность',
  performance: 'Выступление',
  persuasion: 'Убеждение',
  religion: 'Религия',
  sleight_of_hand: 'Ловкость рук',
  stealth: 'Скрытность',
  survival: 'Выживание',
};

export const CONDITION_LABEL_RU: Record<ConditionId, string> = {
  blinded: 'Ослеплённый',
  charmed: 'Очарованный',
  deafened: 'Оглохший',
  exhaustion: 'Истощение',
  frightened: 'Испуганный',
  grappled: 'Схваченный',
  incapacitated: 'Недееспособный',
  invisible: 'Невидимый',
  paralyzed: 'Парализованный',
  petrified: 'Окаменевший',
  poisoned: 'Отравленный',
  prone: 'Сбитый с ног',
  restrained: 'Опутанный',
  stunned: 'Ошеломлённый',
  unconscious: 'Бессознательный',
};

export const DAMAGE_TYPE_LABEL_RU: Record<DamageType | 'nonmagical_bps', string> = {
  acid: 'Кислота',
  bludgeoning: 'Дробящий',
  cold: 'Холод',
  fire: 'Огонь',
  force: 'Силовое поле',
  lightning: 'Электричество',
  necrotic: 'Некротическая энергия',
  piercing: 'Колющий',
  poison: 'Яд',
  psychic: 'Психическая энергия',
  radiant: 'Излучение',
  slashing: 'Рубящий',
  thunder: 'Звук',
  nonmagical_bps: 'Немагический дробящий, колющий и рубящий',
};

export const SCHOOL_LABEL_RU: Record<string, string> = {
  abjuration: 'Ограждение',
  conjuration: 'Вызов',
  divination: 'Прорицание',
  enchantment: 'Очарование',
  evocation: 'Воплощение',
  illusion: 'Иллюзия',
  necromancy: 'Некромантия',
  transmutation: 'Преобразование',
};

export const SIZE_LABEL_RU: Record<string, string> = {
  tiny: 'Крошечный',
  small: 'Маленький',
  medium: 'Средний',
  large: 'Большой',
  huge: 'Огромный',
  gargantuan: 'Громадный',
};

export const ARMOR_CATEGORY_LABEL_RU: Record<string, string> = {
  light: 'Лёгкие доспехи',
  medium: 'Средние доспехи',
  heavy: 'Тяжёлые доспехи',
  shield: 'Щиты',
};
