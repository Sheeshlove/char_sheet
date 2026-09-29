import { z } from 'zod';

export const abilityMethodSchema = z.enum(['standard_array', 'point_buy', 'roll', 'manual']);
export type AbilityMethod = z.infer<typeof abilityMethodSchema>;

/** Настройки кампании (SPEC §4.2). Значения по умолчанию — из спецификации. */
export const campaignSettingsSchema = z.object({
  allowedPacks: z.array(z.string().max(80)).max(50).default(['srd', 'dndsu-official']),
  allowedSources: z.union([z.array(z.string().max(80)).max(200), z.literal('all')]).default('all'),
  featsAllowed: z.boolean().default(true),
  multiclassAllowed: z.boolean().default(true),
  hpMethod: z.enum(['average', 'roll', 'player_choice']).default('player_choice'),
  abilityMethods: z.array(abilityMethodSchema).min(1).default(['standard_array', 'point_buy', 'roll', 'manual']),
  encumbrance: z.enum(['none', 'basic', 'variant']).default('basic'),
  leveling: z.enum(['xp', 'milestone']).default('xp'),
  partySheetVisibility: z.enum(['none', 'summary', 'full']).default('summary'),
  customLanguages: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  startingLevel: z.number().int().min(1).max(20).default(1),
  startingGoldMode: z.enum(['equipment', 'gold', 'both']).default('both'),
});

export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = campaignSettingsSchema.parse({});

/** Разбор сохранённых настроек с подстановкой значений по умолчанию для новых полей. */
export function parseCampaignSettings(raw: unknown): CampaignSettings {
  const res = campaignSettingsSchema.safeParse(raw ?? {});
  return res.success ? res.data : DEFAULT_CAMPAIGN_SETTINGS;
}
