import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { effectSchema, effectsStatusSchema, type ContentEntity, type Feature } from '@ps/content-schema';
import { contentDataDir } from '@ps/content-data';

/**
 * Оверлей (SPEC §7.6): ручные эффекты поверх импортированного текста.
 * `overlays/<pack>/<kind>/<slug>.json`: `{ target, data?, features? }`.
 */
export const overlaySchema = z.strictObject({
  target: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  features: z
    .record(
      z.string(),
      z.strictObject({
        effects: z.array(effectSchema),
        effectsStatus: effectsStatusSchema.optional(),
        nameRu: z.string().optional(),
        level: z.number().int().optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .optional(),
  /** Новые умения, которых нет в источнике (например, служебные). */
  addFeatures: z.array(z.unknown()).optional(),
});
export type Overlay = z.infer<typeof overlaySchema>;

export function loadOverlays(pack: string): Overlay[] {
  const dir = join(contentDataDir(), 'overlays', pack);
  if (!existsSync(dir)) return [];
  const out: Overlay[] = [];
  for (const kind of readdirSync(dir)) {
    const kdir = join(dir, kind);
    for (const f of readdirSync(kdir).filter((x) => x.endsWith('.json'))) {
      const raw = JSON.parse(readFileSync(join(kdir, f), 'utf8'));
      const parsed = overlaySchema.safeParse(raw);
      if (!parsed.success) throw new Error(`Оверлей ${pack}/${kind}/${f}: ${parsed.error.message}`);
      out.push(parsed.data);
    }
  }
  return out;
}

function featureLists(e: ContentEntity): Feature[][] {
  const d = e.data as Record<string, unknown>;
  const lists: Feature[][] = [];
  if (Array.isArray(d.features)) lists.push(d.features as Feature[]);
  if (d.feature && typeof d.feature === 'object') lists.push([d.feature as Feature]);
  return lists;
}

function statusOfFeatures(features: Feature[]): ContentEntity['effectsStatus'] {
  const visible = features.filter((f) => !f.hidden);
  if (!visible.length || visible.every((f) => f.effectsStatus === 'text_only')) return 'text_only';
  if (visible.every((f) => f.effectsStatus === 'complete')) return 'complete';
  return 'partial';
}

/** Применяет оверлеи к сущностям; возвращает список предупреждений (неизвестные цели/умения). */
export function applyOverlays(entities: ContentEntity[], overlays: Overlay[]): string[] {
  const byKey = new Map(entities.map((e) => [e.key, e]));
  const warnings: string[] = [];
  for (const o of overlays) {
    const e = byKey.get(o.target);
    if (!e) {
      warnings.push(`Оверлей: нет сущности ${o.target}`);
      continue;
    }
    if (o.data) Object.assign(e.data as Record<string, unknown>, o.data);
    if (o.addFeatures?.length) {
      const d = e.data as { features?: Feature[] };
      d.features = [...(d.features ?? []), ...(o.addFeatures as Feature[])];
    }
    const lists = featureLists(e);
    for (const [fkey, patch] of Object.entries(o.features ?? {})) {
      const feature = lists.flat().find((f) => f.key === fkey);
      if (!feature) {
        warnings.push(`Оверлей ${o.target}: нет умения «${fkey}»`);
        continue;
      }
      feature.effects = patch.effects;
      feature.effectsStatus = patch.effectsStatus ?? (patch.effects.some((x) => x.type === 'text') ? 'partial' : patch.effects.length ? 'complete' : 'text_only');
      if (patch.nameRu) feature.nameRu = patch.nameRu;
      if (patch.level !== undefined) feature.level = patch.level;
      if (patch.hidden !== undefined) feature.hidden = patch.hidden;
    }
    const all = lists.flat();
    if (all.length) e.effectsStatus = statusOfFeatures(all);
    else if ((e.data as { effectsStatus?: ContentEntity['effectsStatus'] }).effectsStatus) {
      e.effectsStatus = (e.data as { effectsStatus: ContentEntity['effectsStatus'] }).effectsStatus;
    }
  }
  return warnings;
}
