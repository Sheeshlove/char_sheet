import { describe, expect, it } from 'vitest';
import { compute } from '../src';
import { mini } from './fixtures/content-mini';
import { golden } from './helpers';

/** SPEC §16.5: compute для персонажа 20 уровня с мультиклассом — не дольше 10 мс. */
describe('производительность compute', () => {
  it('воин 13 (Мистический рыцарь) / волшебник 7 — в среднем ≤ 10 мс', () => {
    const g = golden('13');
    for (let i = 0; i < 6; i++) g.build.levels.push({ classKey: 'mini/class/fighter', hp: { method: 'average' } });
    g.build.classes.push({ classKey: 'mini/class/wizard' });
    for (let i = 0; i < 7; i++) g.build.levels.push({ classKey: 'mini/class/wizard', hp: { method: 'average' } });
    g.build.knownSpells.push({
      classKey: 'mini/class/wizard',
      cantrips: ['mini/spell/fire-bolt', 'mini/spell/light', 'mini/spell/mage-hand', 'mini/spell/minor-illusion'],
      spells: [],
      spellbook: ['mini/spell/fireball', 'mini/spell/mage-armor', 'mini/spell/shield', 'mini/spell/misty-step', 'mini/spell/counterspell'],
    });
    g.state.inventory.push(
      { id: 'a', key: 'mini/armor/plate', qty: 1, equipped: true, attuned: false },
      { id: 'b', key: 'mini/item/longsword-plus-1', qty: 1, equipped: true, attuned: false, hand: 'main' },
      { id: 'c', key: 'mini/item/ring-of-protection', qty: 1, equipped: true, attuned: true },
    );
    g.state.prepared = { 'mini/class/wizard': ['mini/spell/fireball', 'mini/spell/shield'] };
    const sheet = compute(g.build, g.state, mini, g.rules);
    expect(sheet.level.total).toBe(20);
    expect(sheet.spellcasting.casterLevel).toBe(4 + 7);

    for (let i = 0; i < 30; i++) compute(g.build, g.state, mini, g.rules);
    const runs = 200;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) compute(g.build, g.state, mini, g.rules);
    const avg = (performance.now() - t0) / runs;
    console.log(`compute: ${avg.toFixed(3)} мс в среднем`);
    expect(avg).toBeLessThan(10);
  });
});
