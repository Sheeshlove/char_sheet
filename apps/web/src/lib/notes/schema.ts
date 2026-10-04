import { z } from 'zod';

/** Заметки (SPEC §4.5, §11): типы, видимость, тело TipTap, поля по типу, фильтр списка. */

export const NOTE_TYPES = ['general', 'session', 'npc', 'location', 'quest', 'faction', 'item', 'clue'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];
export const noteTypeSchema = z.enum(NOTE_TYPES);

export const NOTE_VISIBILITIES = ['private', 'gm', 'party'] as const;
export type NoteVisibilityValue = (typeof NOTE_VISIBILITIES)[number];
export const noteVisibilitySchema = z.enum(NOTE_VISIBILITIES);

// ─── Тело: JSON документа TipTap ─────────────────────────────────────────

export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: DocMark[];
  text?: string;
};

const markSchema: z.ZodType<DocMark> = z.object({
  type: z.string().min(1).max(40),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

export const docNodeSchema: z.ZodType<DocNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1).max(40),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(docNodeSchema).max(10_000).optional(),
    marks: z.array(markSchema).max(20).optional(),
    text: z.string().max(200_000).optional(),
  }),
);

/** Предел размера тела заметки в JSON. */
export const MAX_BODY_CHARS = 1_000_000;

export const noteBodySchema = docNodeSchema
  .refine((d) => d.type === 'doc', { message: 'doc' })
  .refine((d) => JSON.stringify(d).length <= MAX_BODY_CHARS, { message: 'too_large' });

export const EMPTY_DOC: DocNode = { type: 'doc', content: [{ type: 'paragraph' }] };

// ─── Поля по типу (§11.2) ────────────────────────────────────────────────

export const NPC_STATUSES = ['alive', 'dead', 'unknown'] as const;
export const ATTITUDES = ['hostile', 'neutral', 'friendly', 'ally'] as const;
export const QUEST_STATUSES = ['active', 'completed', 'failed', 'paused'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];
export const CLUE_RELIABILITY = ['confirmed', 'doubtful', 'false'] as const;

const ref = z.uuid();
const session = z.number().int().min(0).max(100_000);
const shortText = (n: number) => z.string().trim().max(n);

export const noteFieldsSchemas = {
  general: z.strictObject({}),
  session: z.strictObject({ participants: z.array(ref).max(30).default([]) }),
  npc: z.strictObject({
    status: z.enum(NPC_STATUSES).default('unknown'),
    attitude: z.enum(ATTITUDES).default('neutral'),
    location: ref.optional(),
    faction: ref.optional(),
    firstMetSession: session.optional(),
  }),
  location: z.strictObject({ region: shortText(200).optional(), parent: ref.optional() }),
  quest: z.strictObject({
    status: z.enum(QUEST_STATUSES).default('active'),
    giver: ref.optional(),
    rewardRu: shortText(500).optional(),
    priority: z.number().int().min(1).max(3).default(2),
  }),
  faction: z.strictObject({ attitude: z.enum(ATTITUDES).default('neutral'), leader: ref.optional() }),
  item: z.strictObject({ holder: ref.optional(), foundSession: session.optional() }),
  clue: z.strictObject({ reliability: z.enum(CLUE_RELIABILITY).default('doubtful'), sourceRu: shortText(300).optional() }),
} satisfies Record<NoteType, z.ZodType>;

export type NoteFields = { [K in NoteType]: z.infer<(typeof noteFieldsSchemas)[K]> };
export type AnyNoteFields = Partial<Record<string, unknown>>;

/** Поля, ссылающиеся на заметки и персонажей (попадают в `note_links`). */
export const NOTE_REF_FIELDS: Partial<Record<NoteType, string[]>> = {
  npc: ['location', 'faction'],
  location: ['parent'],
  quest: ['giver'],
  faction: ['leader'],
};
export const CHARACTER_REF_FIELDS: Partial<Record<NoteType, string[]>> = {
  session: ['participants'],
  item: ['holder'],
};

/** Поля заметки после проверки по её типу (неизвестные ключи — ошибка). */
export function parseNoteFields(type: NoteType, fields: unknown) {
  return noteFieldsSchemas[type].parse(fields ?? {}) as AnyNoteFields;
}

/** Поля из БД, мягко: при смене схемы лишнее отбрасывается, а не ломает чтение. */
export function readNoteFields(type: NoteType, fields: unknown): AnyNoteFields {
  const r = noteFieldsSchemas[type].safeParse(fields ?? {});
  if (r.success) return r.data as AnyNoteFields;
  const loose = z.object((noteFieldsSchemas[type] as unknown as z.ZodObject).shape).safeParse(fields ?? {});
  return loose.success ? (loose.data as AnyNoteFields) : (noteFieldsSchemas[type].parse({}) as AnyNoteFields);
}

// ─── Фильтр списка (§11.3) ───────────────────────────────────────────────

export const NOTE_SORTS = ['updated', 'created', 'title', 'session'] as const;

export const noteFilterSchema = z.strictObject({
  types: z.array(noteTypeSchema).max(NOTE_TYPES.length).default([]),
  tagsAll: z.array(z.uuid()).max(20).default([]),
  tagsAny: z.array(z.uuid()).max(20).default([]),
  visibility: z.array(noteVisibilitySchema).max(3).default([]),
  sessionFrom: session.optional(),
  sessionTo: session.optional(),
  characterId: z.uuid().optional(),
  authorId: z.uuid().optional(),
  text: z.string().trim().max(200).optional(),
  pinned: z.boolean().optional(),
  handouts: z.boolean().optional(),
  sort: z.enum(NOTE_SORTS).default('updated'),
});
export type NoteFilter = z.infer<typeof noteFilterSchema>;
export type NoteFilterInput = z.input<typeof noteFilterSchema>;

export const noteDateSchema = z.iso.date();

export const TAG_COLORS = ['#a3a3a3', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'] as const;
export const tagColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
