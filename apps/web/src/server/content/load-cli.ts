/** `pnpm content:load` — загрузить JSON-пакеты в БД (только изменившиеся версии, SPEC §7.7). */
import { getDb, getSql } from '../db/client';
import { loadContentPacks } from './load';

const force = process.argv.includes('--force');
loadContentPacks(getDb(), { force })
  .then(async (report) => {
    for (const r of report) {
      console.log(`${r.pack}: ${r.status === 'loaded' ? `загружено ${r.entities}, помечено удалёнными ${r.removed}` : 'без изменений'}`);
    }
    await getSql().end();
  })
  .catch(async (e) => {
    console.error(e);
    await getSql().end();
    process.exit(1);
  });
