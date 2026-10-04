import type { CampaignSettings, CharacterBuild } from '@ps/content-schema';
import type { ChoiceInfo, ComputedSheet, Issue } from '@ps/rules-engine';
import type { ClientContent } from '@/lib/content/use-content';

export const STEPS = ['race', 'class', 'abilities', 'background', 'equipment', 'spells', 'description'] as const;
export type Step = (typeof STEPS)[number];

export type StepProps = {
  characterId: string;
  build: CharacterBuild;
  /** Изменение сборки: применяется локально, выборы чистятся, черновик автосохраняется. */
  update: (fn: (b: CharacterBuild) => CharacterBuild) => void;
  onChoice: (key: string, selected: string[]) => void;
  content: ClientContent;
  rules: CampaignSettings;
  sheet: ComputedSheet;
};

/** Шаг конструктора, к которому относится выбор. */
export function stepOfChoice(c: ChoiceInfo, build: CharacterBuild): Step {
  if (c.kind === 'spells' || c.kind === 'spellbook') return 'spells';
  if (c.sourceKey === build.race || c.sourceKey === build.subrace) return 'race';
  if (c.sourceKey === build.background) return 'background';
  return 'class';
}

/** Шаг, к которому относится проблема `validateBuild` (по `path`). */
export function stepOfIssue(i: Issue, build: CharacterBuild): Step {
  const p = i.path ?? '';
  if (p.startsWith('race') || p.startsWith('subrace')) return 'race';
  if (p.startsWith('background')) return 'background';
  if (p.startsWith('abilities')) return 'abilities';
  if (p.startsWith('identity')) return 'description';
  if (p.startsWith('knownSpells')) return 'spells';
  if (p.startsWith('choices.')) {
    const key = p.slice('choices.'.length);
    if (key.startsWith('spells:')) return 'spells';
    if (key.startsWith(`${build.race}#`) || (build.subrace && key.startsWith(`${build.subrace}#`))) return 'race';
    if (key.startsWith(`${build.background}#`)) return 'background';
  }
  return 'class';
}
