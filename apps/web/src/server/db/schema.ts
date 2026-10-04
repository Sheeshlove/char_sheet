import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () =>
  ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─── 4.1 Пользователи и доступ ─────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  avatarPath: text('avatar_path'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // sha256(token) hex
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const siteInvites = pgTable('site_invites', {
  code: text('code').primaryKey(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: ts('used_at'),
  expiresAt: ts('expires_at'),
  note: text('note').notNull().default(''),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
});

export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
});

// ─── 4.2 Кампании ─────────────────────────────────────────────────────────

export const campaignRole = pgEnum('campaign_role', ['gm', 'co_gm', 'player']);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  settings: jsonb('settings').notNull(),
  archivedAt: ts('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const campaignMembers = pgTable(
  'campaign_members',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: campaignRole('role').notNull(),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] }), index('campaign_members_user_idx').on(t.userId)],
);

export const campaignInvites = pgTable('campaign_invites', {
  code: text('code').primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: ts('expires_at'),
  maxUses: integer('max_uses'),
  uses: integer('uses').notNull().default(0),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
});

// ─── 4.3 Персонажи ────────────────────────────────────────────────────────

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    portraitPath: text('portrait_path'),
    build: jsonb('build').notNull(),
    state: jsonb('state').notNull(),
    version: integer('version').notNull().default(1),
    computedCache: jsonb('computed_cache'),
    engineVersion: text('engine_version'),
    archivedAt: ts('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('characters_owner_idx').on(t.ownerId), index('characters_campaign_idx').on(t.campaignId)],
);

export const characterEvents = pgTable(
  'character_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('character_events_char_idx').on(t.characterId, t.createdAt.desc())],
);

// ─── 4.4 Контент ──────────────────────────────────────────────────────────

export const packSourceType = pgEnum('pack_source_type', ['srd', 'dndsu', 'homebrew']);
export const packVisibility = pgEnum('pack_visibility', ['global', 'campaign', 'private']);
export const contentKind = pgEnum('content_kind', [
  'race',
  'subrace',
  'class',
  'subclass',
  'background',
  'feat',
  'spell',
  'item',
  'weapon',
  'armor',
  'gear',
  'tool',
  'language',
  'condition',
  'feature',
]);
export const effectsStatus = pgEnum('effects_status', ['complete', 'partial', 'text_only']);
export const entityStatus = pgEnum('entity_status', ['draft', 'proposed', 'approved', 'rejected']);

export const contentPacks = pgTable('content_packs', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  sourceType: packSourceType('source_type').notNull(),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  visibility: packVisibility('visibility').notNull().default('global'),
  version: text('version').notNull().default(''),
  importedAt: ts('imported_at'),
});

export const contentEntities = pgTable(
  'content_entities',
  {
    key: text('key').primaryKey(),
    packKey: text('pack_key')
      .notNull()
      .references(() => contentPacks.key, { onDelete: 'cascade' }),
    kind: contentKind('kind').notNull(),
    slug: text('slug').notNull(),
    nameRu: text('name_ru').notNull(),
    nameEn: text('name_en'),
    sourceBook: text('source_book'),
    sourceUrl: text('source_url'),
    data: jsonb('data').notNull(),
    textMd: text('text_md').notNull().default(''),
    effectsStatus: effectsStatus('effects_status').notNull().default('text_only'),
    status: entityStatus('status').notNull().default('approved'),
    reviewComment: text('review_comment'),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('russian', coalesce(name_ru, '')), 'A') || setweight(to_tsvector('simple', coalesce(name_en, '')), 'A') || setweight(to_tsvector('russian', coalesce(text_md, '')), 'C')`,
    ),
    removedAt: ts('removed_at'),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('content_entities_pack_kind_idx').on(t.packKey, t.kind),
    index('content_entities_search_idx').using('gin', t.search),
  ],
);

// ─── 4.5 Заметки ──────────────────────────────────────────────────────────

export const noteType = pgEnum('note_type', [
  'general',
  'session',
  'npc',
  'location',
  'quest',
  'faction',
  'item',
  'clue',
]);
export const visibility = pgEnum('visibility', ['private', 'gm', 'party']);
export const tagScope = pgEnum('tag_scope', ['user', 'campaign']);
export const linkTargetType = pgEnum('link_target_type', ['note', 'character', 'content']);
export const edgeStyle = pgEnum('edge_style', ['solid', 'dashed']);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    type: noteType('type').notNull().default('general'),
    title: text('title').notNull().default(''),
    body: jsonb('body').notNull(),
    bodyText: text('body_text').notNull().default(''),
    fields: jsonb('fields').notNull().default({}),
    visibility: visibility('visibility').notNull().default('private'),
    isHandout: boolean('is_handout').notNull().default(false),
    sessionNo: integer('session_no'),
    gameDate: text('game_date'),
    realDate: date('real_date'),
    pinned: boolean('pinned').notNull().default(false),
    deletedAt: ts('deleted_at'),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('russian', coalesce(title, '')), 'A') || setweight(to_tsvector('russian', coalesce(body_text, '')), 'B')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('notes_search_idx').using('gin', t.search),
    index('notes_campaign_type_idx').on(t.campaignId, t.type),
    index('notes_author_idx').on(t.authorId),
  ],
);

export const noteShares = pgTable(
  'note_shares',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.userId] }), index('note_shares_user_idx').on(t.userId)],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scopeType: tagScope('scope_type').notNull(),
    scopeId: uuid('scope_id').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull().default('#a3a3a3'),
  },
  (t) => [uniqueIndex('tags_scope_name_uq').on(t.scopeType, t.scopeId, sql`lower(${t.name})`)],
);

export const noteTags = pgTable(
  'note_tags',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] })],
);

export const noteLinks = pgTable(
  'note_links',
  {
    fromNoteId: uuid('from_note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    targetType: linkTargetType('target_type').notNull(),
    targetId: text('target_id').notNull(),
    context: text('context').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.fromNoteId, t.targetType, t.targetId] }),
    index('note_links_target_idx').on(t.targetType, t.targetId),
  ],
);

export const noteVersions = pgTable(
  'note_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: jsonb('body').notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('note_versions_note_idx').on(t.noteId, t.createdAt.desc())],
);

export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  visibility: visibility('visibility').notNull().default('private'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const boardNodes = pgTable('board_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  noteId: uuid('note_id').references(() => notes.id, { onDelete: 'cascade' }),
  label: text('label'),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  color: text('color'),
});

export const boardEdges = pgTable('board_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  fromNodeId: uuid('from_node_id')
    .notNull()
    .references(() => boardNodes.id, { onDelete: 'cascade' }),
  toNodeId: uuid('to_node_id')
    .notNull()
    .references(() => boardNodes.id, { onDelete: 'cascade' }),
  label: text('label'),
  style: edgeStyle('style').notNull().default('solid'),
});

export const savedFilters = pgTable('saved_filters', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  query: jsonb('query').notNull(),
  createdAt: createdAt(),
});

// ─── 4.6 Файлы ────────────────────────────────────────────────────────────

export const fileAttachedType = pgEnum('file_attached_type', ['portrait', 'note', 'campaign', 'avatar']);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    attachedType: fileAttachedType('attached_type').notNull(),
    attachedId: uuid('attached_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('files_attached_idx').on(t.attachedType, t.attachedId)],
);

// ─── 4.7 Броски ───────────────────────────────────────────────────────────

export const rollLog = pgTable(
  'roll_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expression: text('expression').notNull(),
    result: jsonb('result').notNull(),
    label: text('label').notNull().default(''),
    visibility: visibility('visibility').notNull().default('party'),
    createdAt: createdAt(),
  },
  (t) => [index('roll_log_campaign_idx').on(t.campaignId, t.createdAt.desc())],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignMember = typeof campaignMembers.$inferSelect;
export type CampaignRole = (typeof campaignRole.enumValues)[number];
export type CharacterRow = typeof characters.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type Visibility = (typeof visibility.enumValues)[number];
