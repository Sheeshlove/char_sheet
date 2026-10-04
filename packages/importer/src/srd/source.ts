import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SrdData } from './types';

/** Зафиксированный коммит 5e-database: повторный импорт даёт тот же результат. */
export const SRD_COMMIT = 'bce51b3958573819e3b842fbc0cd9524fe4bc2e1';
export const SRD_REPO = 'https://github.com/5e-bits/5e-database';

export const IMPORTER_DIR = join(import.meta.dirname, '..', '..');
export const VENDOR_DIR = join(IMPORTER_DIR, '.vendor', '5e-database');

/**
 * Каталог данных 2014: `SRD_DATA_DIR` или локальный клон в `.vendor/` (в .gitignore).
 * Если клона нет — он создаётся на зафиксированном коммите (единственный сетевой шаг).
 */
export function ensureSrdSource(): string {
  const fromEnv = process.env.SRD_DATA_DIR;
  if (fromEnv) return fromEnv;
  const dataDir = join(VENDOR_DIR, 'src', '2014');
  if (!existsSync(dataDir)) {
    console.log(`Клонирую ${SRD_REPO}…`);
    execFileSync('git', ['clone', '--quiet', '--filter=blob:none', SRD_REPO, VENDOR_DIR], { stdio: 'inherit' });
  }
  try {
    const head = execFileSync('git', ['-C', VENDOR_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (head !== SRD_COMMIT) {
      try {
        execFileSync('git', ['-C', VENDOR_DIR, 'checkout', '--quiet', SRD_COMMIT], { stdio: 'inherit' });
      } catch {
        execFileSync('git', ['-C', VENDOR_DIR, 'fetch', '--quiet', '--depth', '1', 'origin', SRD_COMMIT], { stdio: 'inherit' });
        execFileSync('git', ['-C', VENDOR_DIR, 'checkout', '--quiet', SRD_COMMIT], { stdio: 'inherit' });
      }
    }
  } catch (e) {
    console.warn('Не удалось проверить коммит 5e-database:', e instanceof Error ? e.message : e);
  }
  return dataDir;
}

function read<T>(dir: string, lang: 'en' | 'ru', name: string): T {
  return JSON.parse(readFileSync(join(dir, lang, `5e-SRD-${name}.json`), 'utf8')) as T;
}

export function loadSrd(dir = ensureSrdSource()): SrdData {
  return {
    equipment: read(dir, 'en', 'Equipment'),
    magicItems: read(dir, 'en', 'Magic-Items'),
    spells: read(dir, 'en', 'Spells'),
    classes: read(dir, 'en', 'Classes'),
    levels: read(dir, 'en', 'Levels'),
    features: read(dir, 'en', 'Features'),
    subclasses: read(dir, 'en', 'Subclasses'),
    races: read(dir, 'en', 'Races'),
    subraces: read(dir, 'en', 'Subraces'),
    traits: read(dir, 'en', 'Traits'),
    proficiencies: read(dir, 'en', 'Proficiencies'),
    backgrounds: read(dir, 'en', 'Backgrounds'),
    feats: read(dir, 'en', 'Feats'),
    conditionsEn: read(dir, 'en', 'Conditions'),
    conditionsRu: read(dir, 'ru', 'Conditions'),
    languagesEn: read(dir, 'en', 'Languages'),
    languagesRu: read(dir, 'ru', 'Languages'),
  };
}
