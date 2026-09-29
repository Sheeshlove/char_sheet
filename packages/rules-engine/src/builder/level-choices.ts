import { ABILITIES } from '@ps/content-schema';
import { ABILITY_LABEL_RU } from '../tables/abilities';
import type { ChoiceInfo } from '../types';
import type { Pipeline } from '../pipeline/context';
import { hitDieOf } from '../pipeline/hp';

/** Выборы, привязанные к уровням: подкласс, ASI/черта, бросок хитов. */
export function levelChoices(p: Pipeline): ChoiceInfo[] {
  const out: ChoiceInfo[] = [];
  const { build, content } = p;

  for (const c of build.classes) {
    const cls = content.getOf(c.classKey, 'class');
    if (!cls) continue;
    const lvl = p.classLevel(c.classKey);
    if (lvl < cls.data.subclassLevel) continue;
    const options = content
      .byKind('subclass')
      .filter((s) => s.data.classKey === c.classKey)
      .map((s) => ({ value: s.key, labelRu: s.nameRu }));
    out.push({
      key: `subclass:${c.classKey}`,
      kind: 'subclass',
      labelRu: `${cls.nameRu}: ${cls.data.subclassLabelRu}`,
      sourceKey: c.classKey,
      sourceLabelRu: cls.nameRu,
      choose: 1,
      selected: c.subclassKey ? [c.subclassKey] : [],
      options,
      classKey: c.classKey,
    });
  }

  const running = new Map<string, number>();
  build.levels.forEach((lvl, i) => {
    const n = (running.get(lvl.classKey) ?? 0) + 1;
    running.set(lvl.classKey, n);
    const cls = content.getOf(lvl.classKey, 'class');
    if (!cls) return;
    if (cls.data.asiLevels.includes(n)) {
      const selected =
        lvl.asi?.kind === 'feat'
          ? [lvl.asi.featKey]
          : lvl.asi?.kind === 'asi'
            ? Object.entries(lvl.asi.increases).flatMap(([a, v]) => Array.from({ length: v ?? 0 }, () => a))
            : [];
      const options = [
        ...ABILITIES.map((a) => ({ value: a, labelRu: ABILITY_LABEL_RU[a] })),
        ...(p.rules.featsAllowed ? content.byKind('feat').map((f) => ({ value: f.key, labelRu: f.nameRu })) : []),
      ];
      out.push({
        key: `asi:${i}`,
        kind: 'asi',
        labelRu: `${cls.nameRu} ${n}: увеличение характеристик${p.rules.featsAllowed ? ' или черта' : ''}`,
        sourceKey: lvl.classKey,
        sourceLabelRu: cls.nameRu,
        choose: lvl.asi?.kind === 'feat' ? 1 : 2,
        selected,
        options,
        levelIndex: i,
        classKey: lvl.classKey,
      });
    }
    if (i > 0 && lvl.hp.method === 'roll' && lvl.hp.roll === undefined) {
      const die = hitDieOf(p, lvl.classKey);
      out.push({
        key: `hp:${i}`,
        kind: 'hp',
        labelRu: `Уровень ${i + 1}: бросок кости хитов (к${die})`,
        sourceKey: lvl.classKey,
        sourceLabelRu: cls.nameRu,
        choose: 1,
        selected: [],
        options: Array.from({ length: die }, (_, k) => ({ value: String(k + 1), labelRu: String(k + 1) })),
        levelIndex: i,
        classKey: lvl.classKey,
      });
    }
  });
  return out;
}
