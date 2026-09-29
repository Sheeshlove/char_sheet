import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** JSON с детерминированным порядком ключей — стабильные диффы между импортами. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

export function writeJson(path: string, value: unknown): string {
  mkdirSync(dirname(path), { recursive: true });
  const content = stableStringify(value);
  writeFileSync(path, content);
  return content;
}
