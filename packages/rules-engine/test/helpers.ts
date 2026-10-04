import { DEFAULT_CAMPAIGN_SETTINGS, type CampaignSettings, type CharacterBuild, type CharacterState } from '@ps/content-schema';
import { loadGoldens, type Golden } from './golden-runner';

const cache = new Map<string, Golden>();

/** Копия эталона по префиксу номера (`'01'`). */
export function golden(prefix: string): Golden {
  if (!cache.size) for (const g of loadGoldens()) cache.set(g.id.slice(0, 2), g);
  const g = cache.get(prefix);
  if (!g) throw new Error(`no golden ${prefix}`);
  return JSON.parse(JSON.stringify(g)) as Golden;
}

export function rules(p: Partial<CampaignSettings> = {}): CampaignSettings {
  return { ...DEFAULT_CAMPAIGN_SETTINGS, ...p };
}

export type { CharacterBuild, CharacterState };
