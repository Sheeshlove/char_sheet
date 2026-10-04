import { join } from 'node:path';
import type { ContentEntity } from '@ps/content-schema';
import { contentDataDir } from '@ps/content-data';
import { applyOverlays, loadOverlays } from '../overlays';
import { writePack } from '../pack-writer';
import { loadDictionary, Translator } from './dict';
import { convertEquipment, convertMagicItems } from './convert-equipment';
import { convertSpells } from './convert-spells';
import { convertClasses } from './convert-classes';
import { convertBackgrounds, convertConditions, convertFeats, convertLanguages, convertRaces } from './convert-races';
import { SRD_COMMIT } from './source';
import type { SrdData } from './types';

export type SrdBuildResult = {
  entities: ContentEntity[];
  missingTranslations: Record<string, string[]>;
  overlayWarnings: string[];
};

/** Преобразование данных 5e-database в сущности пакета `srd` (без записи на диск). */
export function buildSrdEntities(src: SrdData): SrdBuildResult {
  const tr = new Translator(loadDictionary());
  const { entities: equipment, index } = convertEquipment(src.equipment, tr);
  const entities: ContentEntity[] = [
    ...equipment,
    ...convertMagicItems(src.magicItems, tr, index),
    ...convertSpells(src.spells, tr),
    ...convertClasses(src, tr, index),
    ...convertRaces(src, tr),
    ...convertBackgrounds(src, tr, index),
    ...convertFeats(src, tr),
    ...convertLanguages(src),
    ...convertConditions(src),
  ];
  const overlayWarnings = applyOverlays(entities, loadOverlays('srd'));
  const missingTranslations = Object.fromEntries([...tr.missing.entries()].map(([k, v]) => [k, [...v].sort()]));
  return { entities, missingTranslations, overlayWarnings };
}

export function writeSrdPack(src: SrdData) {
  const res = buildSrdEntities(src);
  const out = writePack(
    join(contentDataDir(), 'srd'),
    {
      key: 'srd',
      name: 'SRD 5.1',
      sourceType: 'srd',
      source: `5e-database@${SRD_COMMIT}`,
    },
    res.entities,
  );
  return { ...res, ...out };
}
