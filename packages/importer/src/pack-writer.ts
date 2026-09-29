import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseEntityData, type ContentEntity } from '@ps/content-schema';
import { packVersion, type PackManifest } from '@ps/content-data';
import { writeJson } from './util/json';

export type PackWriteResult = { manifest: PackManifest; errors: string[] };

/** Проверяет сущности схемами и пишет пакет: `<kind>.json` + `pack.json` с версией-хэшем. */
export function writePack(
  dir: string,
  meta: Omit<PackManifest, 'version' | 'kinds'>,
  entities: ContentEntity[],
): PackWriteResult {
  const errors: string[] = [];
  const byKind = new Map<string, ContentEntity[]>();
  const keys = new Set<string>();
  for (const e of entities) {
    if (keys.has(e.key)) errors.push(`Дубликат ключа ${e.key}`);
    keys.add(e.key);
    const r = parseEntityData(e.kind, e.data);
    if (!r.success) {
      errors.push(`${e.key}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      continue;
    }
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }
  mkdirSync(dir, { recursive: true });
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    if (f.endsWith('.json') && f !== 'key-map.json') rmSync(join(dir, f));
  }
  const files: { name: string; content: string }[] = [];
  for (const [kind, list] of [...byKind.entries()].sort()) {
    list.sort((a, b) => a.key.localeCompare(b.key));
    const name = `${kind}.json`;
    files.push({ name, content: writeJson(join(dir, name), list) });
  }
  const manifest: PackManifest = {
    ...meta,
    version: packVersion(files),
    kinds: Object.fromEntries([...byKind.entries()].sort().map(([k, v]) => [k, v.length])),
  };
  writeJson(join(dir, 'pack.json'), manifest);
  return { manifest, errors };
}
