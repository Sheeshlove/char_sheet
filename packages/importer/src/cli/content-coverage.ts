/** `pnpm content:coverage` — отчёт покрытия эффектами в `docs/content-coverage.md` (SPEC §7.8). */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAllPacks } from '@ps/content-data';
import { coverageMarkdown } from '../content/coverage';

const md = coverageMarkdown(readAllPacks());
const out = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'content-coverage.md');
writeFileSync(out, md);
console.log(`Записано: docs/content-coverage.md`);
