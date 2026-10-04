/**
 * `pnpm import:srd` — собрать пакет `srd` из 5e-database (SPEC §7.2) в
 * `packages/content-data/srd/*.json`. Сеть нужна только для первичного клона 5e-database.
 */
import { loadSrd } from '../srd/source';
import { writeSrdPack } from '../srd/build';

const res = writeSrdPack(loadSrd());
console.log(`Пакет srd: версия ${res.manifest.version.slice(0, 12)}…`);
for (const [kind, n] of Object.entries(res.manifest.kinds)) console.log(`  ${kind}: ${n}`);
const missing = Object.entries(res.missingTranslations);
if (missing.length) {
  console.warn('Нет русских названий в dictionaries/srd-ru.json:');
  for (const [section, keys] of missing) console.warn(`  ${section}: ${keys.join(', ')}`);
}
for (const w of res.overlayWarnings) console.warn(w);
if (res.errors.length) {
  console.error(`Ошибки схемы (${res.errors.length}):`);
  for (const e of res.errors.slice(0, 50)) console.error(`  ${e}`);
  process.exit(1);
}
