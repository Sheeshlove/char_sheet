import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { stringify as toYaml } from 'yaml';
import type { Db } from '../db/client';
import { characters, notes, noteTags, tags } from '../db/schema';
import { insertNote, tagsForNotes, visibleNoteSql, type NoteRow } from '../services/notes';
import { docToMarkdown, mapDoc } from '@/lib/notes/doc';
import {
  CHARACTER_REF_FIELDS,
  NOTE_REF_FIELDS,
  NOTE_TYPES,
  NOTE_VISIBILITIES,
  noteBodySchema,
  noteFieldsSchemas,
  type DocNode,
  type NoteType,
  type NoteVisibilityValue,
} from '@/lib/notes/schema';
import { ru } from '@/i18n/ru';
import { parseMarkdownNote } from './markdown';

/**
 * Экспорт и импорт заметок (SPEC §11.5): одна заметка → `.md`, область → `.zip` с папками
 * по типам; WikiLink → `[[Заголовок]]`, теги и поля → YAML-frontmatter. Импорт `.md`/`.zip`
 * (формат Obsidian): ссылки разрешаются по имени файла/заголовку после разбора всех файлов.
 */

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_NOTES = 1000;

export function safeFileName(s: string): string {
  const name = Array.from(s.replace(/[\\/:*?"<>|]/g, '_'), (c) => (c.charCodeAt(0) < 32 ? '_' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return name || ru.notes.untitled;
}

type ExportNote = Pick<NoteRow, 'id' | 'title' | 'type' | 'body' | 'fields' | 'visibility' | 'sessionNo' | 'gameDate' | 'realDate' | 'pinned'>;

/** Уникальные имена файлов (без `.md`): ими же подписываются ссылки `[[…]]`. */
function stems(list: ExportNote[]): Map<string, string> {
  const used = new Map<string, number>();
  const out = new Map<string, string>();
  for (const n of list) {
    const base = safeFileName(n.title);
    const k = base.toLowerCase();
    const count = (used.get(k) ?? 0) + 1;
    used.set(k, count);
    out.set(n.id, count === 1 ? base : `${base} (${count})`);
  }
  return out;
}

async function characterNames(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: characters.id, name: characters.name }).from(characters).where(inArray(characters.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

function noteMarkdown(
  n: ExportNote,
  tagNames: string[],
  stemOf: (id: string) => string | undefined,
  charName: (id: string) => string | undefined,
): string {
  const fields: Record<string, unknown> = { ...(n.fields as Record<string, unknown>) };
  for (const f of NOTE_REF_FIELDS[n.type] ?? []) {
    const id = fields[f];
    if (typeof id === 'string') {
      const stem = stemOf(id);
      if (stem) fields[f] = `[[${stem}]]`;
      else delete fields[f];
    }
  }
  for (const f of CHARACTER_REF_FIELDS[n.type] ?? []) {
    const v = fields[f];
    if (Array.isArray(v)) fields[f] = v.map((id) => charName(String(id))).filter(Boolean);
    else if (typeof v === 'string') {
      const name = charName(v);
      if (name) fields[f] = name;
      else delete fields[f];
    }
  }
  const fm: Record<string, unknown> = { title: n.title, type: n.type, visibility: n.visibility };
  if (tagNames.length) fm.tags = tagNames;
  if (n.sessionNo !== null) fm.session = n.sessionNo;
  if (n.gameDate) fm.gameDate = n.gameDate;
  if (n.realDate) fm.realDate = n.realDate;
  if (n.pinned) fm.pinned = true;
  if (Object.keys(fields).length) fm.fields = fields;
  const body = docToMarkdown(n.body as DocNode, stemOf);
  return `---\n${toYaml(fm, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}`;
}

/** Одна заметка → Markdown (ссылки подписываются актуальными заголовками целей). */
export async function exportNoteMarkdown(db: Db, userId: string, note: NoteRow): Promise<string> {
  const links = new Set<string>();
  mapDoc(note.body as DocNode, (n) => {
    if (n.type === 'wikiLink' && typeof n.attrs?.noteId === 'string') links.add(n.attrs.noteId);
    if (n.type === 'mention' && n.attrs?.targetType === 'note' && typeof n.attrs.targetId === 'string') links.add(n.attrs.targetId);
    return n;
  });
  for (const f of NOTE_REF_FIELDS[note.type] ?? []) {
    const v = (note.fields as Record<string, unknown>)[f];
    if (typeof v === 'string') links.add(v);
  }
  const uuid = [...links].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const targets = uuid.length
    ? await db
        .select({ id: notes.id, title: notes.title })
        .from(notes)
        .where(and(inArray(notes.id, uuid), isNull(notes.deletedAt), visibleNoteSql(userId)))
    : [];
  const titles = new Map(targets.map((t) => [t.id, safeFileName(t.title)]));
  const charIds = (CHARACTER_REF_FIELDS[note.type] ?? []).flatMap((f) => {
    const v = (note.fields as Record<string, unknown>)[f];
    return Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : [];
  });
  const names = await characterNames(db, charIds);
  const tagMap = await tagsForNotes(db, [note.id]);
  return noteMarkdown(note, (tagMap.get(note.id) ?? []).map((t) => t.name), (id) => titles.get(id), (id) => names.get(id));
}

/** Область (кампания или личные) → zip: папки по типам, файлы `<заголовок>.md`. */
export async function exportScopeZip(db: Db, userId: string, campaignId: string | null): Promise<Uint8Array> {
  const list = await db
    .select()
    .from(notes)
    .where(
      and(
        campaignId ? eq(notes.campaignId, campaignId) : and(isNull(notes.campaignId), eq(notes.authorId, userId)),
        isNull(notes.deletedAt),
        visibleNoteSql(userId),
      ),
    )
    .orderBy(notes.createdAt);
  const stemMap = stems(list);
  const tagMap = await tagsForNotes(
    db,
    list.map((n) => n.id),
  );
  const charIds = list.flatMap((n) =>
    (CHARACTER_REF_FIELDS[n.type] ?? []).flatMap((f) => {
      const v = (n.fields as Record<string, unknown>)[f];
      return Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : [];
    }),
  );
  const names = await characterNames(db, [...new Set(charIds)]);
  const files: Record<string, Uint8Array> = {};
  for (const n of list) {
    const md = noteMarkdown(
      n,
      (tagMap.get(n.id) ?? []).map((t) => t.name),
      (id) => stemMap.get(id),
      (id) => names.get(id),
    );
    files[`${safeFileName(ru.notes.typesPlural[n.type] ?? n.type)}/${stemMap.get(n.id)}.md`] = strToU8(md);
  }
  return zipSync(files, { level: 6 });
}

// ─── Импорт ──────────────────────────────────────────────────────────────

export class ImportError extends Error {
  constructor(readonly key: 'importTooLarge' | 'importInvalid' | 'importEmpty') {
    super(key);
  }
}

type Parsed = {
  id: string;
  stem: string;
  title: string;
  type: NoteType;
  visibility: NoteVisibilityValue;
  tags: string[];
  sessionNo: number | null;
  gameDate: string | null;
  realDate: string | null;
  pinned: boolean;
  fields: Record<string, unknown>;
  doc: DocNode;
};

const TYPE_BY_FOLDER = new Map<string, NoteType>(
  NOTE_TYPES.flatMap((t) => [
    [t, t] as [string, NoteType],
    [(ru.notes.typesPlural[t] ?? t).toLowerCase(), t] as [string, NoteType],
    [(ru.notes.types[t] ?? t).toLowerCase(), t] as [string, NoteType],
  ]),
);

function readFiles(name: string, data: Uint8Array): { path: string; text: string }[] {
  if (/\.zip$/i.test(name) || (data[0] === 0x50 && data[1] === 0x4b)) {
    let total = 0;
    let count = 0;
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(data, {
        filter: (f) => {
          if (!/\.(md|markdown)$/i.test(f.name) || f.name.split('/').some((p) => p.startsWith('.') || p === '__MACOSX')) return false;
          total += f.originalSize;
          count++;
          if (total > MAX_IMPORT_BYTES || count > MAX_IMPORT_NOTES) throw new ImportError('importTooLarge');
          return true;
        },
      });
    } catch (e) {
      if (e instanceof ImportError) throw e;
      throw new ImportError('importInvalid');
    }
    return Object.entries(entries).map(([path, bytes]) => ({ path, text: strFromU8(bytes) }));
  }
  if (!/\.(md|markdown|txt)$/i.test(name)) throw new ImportError('importInvalid');
  return [{ path: name, text: strFromU8(data) }];
}

const str = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const refTitle = (v: unknown) => {
  const s = str(v, 200);
  const m = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(s);
  return (m ? m[1]! : s).trim();
};

function parseFile(path: string, text: string, personal: boolean): Parsed {
  const { frontmatter: fm, doc } = parseMarkdownNote(text);
  const parts = path.split('/');
  const stem = parts.at(-1)!.replace(/\.(md|markdown|txt)$/i, '');
  const folder = parts.length > 1 ? parts.at(-2)!.toLowerCase() : '';
  const fmType = str(fm.type, 20).toLowerCase();
  const type = (NOTE_TYPES as readonly string[]).includes(fmType) ? (fmType as NoteType) : (TYPE_BY_FOLDER.get(folder) ?? 'general');
  const vis = str(fm.visibility, 10);
  const rawTags = Array.isArray(fm.tags) ? fm.tags : typeof fm.tags === 'string' ? fm.tags.split(',') : [];
  const session = Number(fm.session ?? fm.sessionNo);
  const realDate = str(fm.realDate, 10);
  return {
    id: randomUUID(),
    stem,
    title: str(fm.title, 200) || stem,
    type,
    visibility: personal ? 'private' : (NOTE_VISIBILITIES as readonly string[]).includes(vis) ? (vis as NoteVisibilityValue) : 'private',
    tags: [...new Set(rawTags.map((t) => str(t, 40).replace(/^#/, '')).filter(Boolean))].slice(0, 30),
    sessionNo: Number.isInteger(session) && session >= 0 && session <= 100_000 ? session : null,
    gameDate: str(fm.gameDate, 100) || null,
    realDate: /^\d{4}-\d{2}-\d{2}$/.test(realDate) ? realDate : null,
    pinned: fm.pinned === true,
    fields: fm.fields && typeof fm.fields === 'object' && !Array.isArray(fm.fields) ? (fm.fields as Record<string, unknown>) : {},
    doc,
  };
}

/** Поля по схеме типа: ссылки разрешены, неизвестное и некорректное отброшено. */
function cleanFields(type: NoteType, raw: Record<string, unknown>, noteByTitle: (t: string) => string | undefined, charByName: (n: string) => string | undefined) {
  const out: Record<string, unknown> = {};
  const noteRefs = NOTE_REF_FIELDS[type] ?? [];
  const charRefs = CHARACTER_REF_FIELDS[type] ?? [];
  for (const [k, v] of Object.entries(raw)) {
    if (noteRefs.includes(k)) {
      const id = noteByTitle(refTitle(v));
      if (id) out[k] = id;
    } else if (charRefs.includes(k)) {
      if (Array.isArray(v)) out[k] = v.map((x) => charByName(str(x, 120))).filter(Boolean);
      else {
        const id = charByName(str(v, 120));
        if (id) out[k] = id;
      }
    } else out[k] = v;
  }
  const schema = noteFieldsSchemas[type];
  const full = schema.safeParse(out);
  if (full.success) return full.data as Record<string, unknown>;
  // По одному полю: оставить только корректные.
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) if (schema.safeParse({ ...kept, [k]: v }).success) kept[k] = v;
  return schema.parse(kept) as Record<string, unknown>;
}

/** Импорт файла в область. Возвращает число созданных заметок. */
export async function importNotes(
  db: Db,
  userId: string,
  campaignId: string | null,
  file: { name: string; data: Uint8Array },
): Promise<number> {
  if (file.data.byteLength > MAX_IMPORT_BYTES) throw new ImportError('importTooLarge');
  const parsed = readFiles(file.name, file.data).map((f) => parseFile(f.path, f.text, !campaignId));
  if (!parsed.length) throw new ImportError('importEmpty');
  if (parsed.length > MAX_IMPORT_NOTES) throw new ImportError('importTooLarge');

  // Цели ссылок: сначала импортируемые (по имени файла, затем по заголовку), потом существующие заметки области.
  const byKey = new Map<string, string>();
  for (const p of parsed) if (!byKey.has(p.stem.toLowerCase())) byKey.set(p.stem.toLowerCase(), p.id);
  for (const p of parsed) if (!byKey.has(p.title.toLowerCase())) byKey.set(p.title.toLowerCase(), p.id);
  const existing = await db
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(
      and(
        campaignId ? eq(notes.campaignId, campaignId) : and(isNull(notes.campaignId), eq(notes.authorId, userId)),
        isNull(notes.deletedAt),
        visibleNoteSql(userId),
      ),
    );
  for (const n of existing) if (!byKey.has(n.title.toLowerCase())) byKey.set(n.title.toLowerCase(), n.id);
  const noteByTitle = (t: string) => (t ? byKey.get(t.toLowerCase()) : undefined);

  const chars = await db
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .where(campaignId ? eq(characters.campaignId, campaignId) : eq(characters.ownerId, userId));
  const charByName = (n: string) => chars.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id;

  const resolveDoc = (doc: DocNode): DocNode => {
    const walk = (n: DocNode): DocNode[] => {
      if (n.type === 'wikiLink' && !n.attrs?.noteId) {
        const title = String(n.attrs?.title ?? n.attrs?.label ?? '');
        const label = String(n.attrs?.label ?? title);
        const id = noteByTitle(title);
        return [id ? { type: 'wikiLink', attrs: { noteId: id, label } } : { type: 'text', text: `[[${title}]]` }];
      }
      return [n.content ? { ...n, content: n.content.flatMap(walk) } : n];
    };
    return walk(doc)[0]!;
  };

  await db.transaction(async (tx) => {
    const scope = campaignId ? { scopeType: 'campaign' as const, scopeId: campaignId } : { scopeType: 'user' as const, scopeId: userId };
    const tagIds = new Map<string, string>();
    const wanted = [...new Set(parsed.flatMap((p) => p.tags))];
    if (wanted.length) {
      const found = await tx
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(and(eq(tags.scopeType, scope.scopeType), eq(tags.scopeId, scope.scopeId)));
      for (const t of found) tagIds.set(t.name.toLowerCase(), t.id);
      for (const name of wanted) {
        if (tagIds.has(name.toLowerCase())) continue;
        const [row] = await tx
          .insert(tags)
          .values({ ...scope, name })
          .onConflictDoNothing()
          .returning({ id: tags.id });
        if (row) tagIds.set(name.toLowerCase(), row.id);
        else {
          const [again] = await tx
            .select({ id: tags.id })
            .from(tags)
            .where(and(eq(tags.scopeType, scope.scopeType), eq(tags.scopeId, scope.scopeId), sql`lower(${tags.name}) = ${name.toLowerCase()}`));
          if (again) tagIds.set(name.toLowerCase(), again.id);
        }
      }
    }
    for (const p of parsed) {
      const body = noteBodySchema.safeParse(resolveDoc(p.doc));
      await insertNote(tx, {
        id: p.id,
        authorId: userId,
        campaignId,
        type: p.type,
        title: p.title,
        body: body.success ? body.data : { type: 'doc', content: [{ type: 'paragraph' }] },
        fields: cleanFields(p.type, p.fields, noteByTitle, charByName),
        visibility: p.visibility,
        sessionNo: p.sessionNo,
        gameDate: p.gameDate,
        realDate: p.realDate,
        pinned: p.pinned,
      });
      const ids = p.tags.map((t) => tagIds.get(t.toLowerCase())).filter((x): x is string => !!x);
      if (ids.length) await tx.insert(noteTags).values([...new Set(ids)].map((tagId) => ({ noteId: p.id, tagId })));
    }
  });
  return parsed.length;
}
