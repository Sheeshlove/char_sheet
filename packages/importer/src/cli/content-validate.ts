/** `pnpm content:validate` — zod + вычисление всех выражений на тестовом персонаже (SPEC §7.2). */
import { readAllPacks } from '@ps/content-data';
import { validateContent } from '../content/validate';

const packs = readAllPacks();
const report = validateContent(packs.flatMap((p) => p.entities));
console.log(`Пакеты: ${packs.map((p) => `${p.manifest.key} (${p.entities.length})`).join(', ')}`);
for (const w of report.warnings) console.warn(`предупреждение: ${w}`);
for (const e of report.errors) console.error(`ошибка: ${e}`);
console.log(`Сущностей: ${report.entities}; ошибок: ${report.errors.length}; предупреждений: ${report.warnings.length}`);
if (report.errors.length) process.exit(1);
