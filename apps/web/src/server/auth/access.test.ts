import { describe, expect, it } from 'vitest';
import {
  canArchiveCharacter,
  canAttachCharacter,
  canCampaign,
  canDetachCharacter,
  canEditCharacterBuild,
  canEditCharacterState,
  canEditNote,
  canGrantToCharacter,
  canHomebrew,
  canShareNote,
  canTrashNote,
  canViewNote,
  characterViewLevel,
  type CampaignRole,
  type CharacterAccessInput,
  type NoteAccessInput,
  type NoteVisibility,
  type SheetVisibility,
} from './access';

/**
 * Параметризованные тесты матрицы прав SPEC §5.3.
 * Столбцы: владелец персонажа (игрок кампании), другой игрок кампании, мастер, со-мастер,
 * админ сайта (не участник кампании).
 */
type Actor = 'owner' | 'otherPlayer' | 'gm' | 'coGm' | 'admin';
const ACTORS: Actor[] = ['owner', 'otherPlayer', 'gm', 'coGm', 'admin'];

const USERS: Record<Actor, { id: string; role: CampaignRole | null; isAdmin: boolean }> = {
  owner: { id: 'u-owner', role: 'player', isAdmin: false },
  otherPlayer: { id: 'u-other', role: 'player', isAdmin: false },
  gm: { id: 'u-gm', role: 'gm', isAdmin: false },
  coGm: { id: 'u-cogm', role: 'co_gm', isAdmin: false },
  admin: { id: 'u-admin', role: null, isAdmin: true },
};

const CAMPAIGN = 'c-1';

function charInput(actor: Actor, vis: SheetVisibility = 'summary'): CharacterAccessInput {
  const u = USERS[actor];
  return {
    userId: u.id,
    isAdmin: u.isAdmin,
    character: { ownerId: USERS.owner.id, campaignId: CAMPAIGN },
    viewerRole: u.role,
    partySheetVisibility: vis,
  };
}

type Row<T> = { action: string; expected: Record<Actor, T>; check: (actor: Actor) => T };

const characterRows: Row<unknown>[] = [
  {
    action: 'Видеть лист (partySheetVisibility = none)',
    expected: { owner: 'full', otherPlayer: 'none', gm: 'full', coGm: 'full', admin: 'none' },
    check: (a) => characterViewLevel(charInput(a, 'none')),
  },
  {
    action: 'Видеть лист (partySheetVisibility = summary)',
    expected: { owner: 'full', otherPlayer: 'summary', gm: 'full', coGm: 'full', admin: 'none' },
    check: (a) => characterViewLevel(charInput(a, 'summary')),
  },
  {
    action: 'Видеть лист (partySheetVisibility = full)',
    expected: { owner: 'full', otherPlayer: 'full', gm: 'full', coGm: 'full', admin: 'none' },
    check: (a) => characterViewLevel(charInput(a, 'full')),
  },
  {
    action: 'Менять build',
    expected: { owner: true, otherPlayer: false, gm: true, coGm: true, admin: false },
    check: (a) => canEditCharacterBuild(charInput(a)),
  },
  {
    action: 'Менять state (хиты, ячейки…)',
    expected: { owner: true, otherPlayer: false, gm: true, coGm: true, admin: false },
    check: (a) => canEditCharacterState(charInput(a)),
  },
  {
    action: 'Выдать опыт/предмет/состояние',
    expected: { owner: false, otherPlayer: false, gm: true, coGm: true, admin: false },
    check: (a) => canGrantToCharacter(charInput(a)),
  },
  {
    action: 'Прикрепить к кампании (владелец — участник целевой кампании)',
    expected: { owner: true, otherPlayer: false, gm: false, coGm: false, admin: false },
    check: (a) => canAttachCharacter(charInput(a), USERS[a].role),
  },
  {
    action: 'Отвязать от кампании',
    expected: { owner: true, otherPlayer: false, gm: true, coGm: true, admin: false },
    check: (a) => canDetachCharacter(charInput(a)),
  },
  {
    action: 'Удалить (в архив)',
    expected: { owner: true, otherPlayer: false, gm: false, coGm: false, admin: false },
    check: (a) => canArchiveCharacter(charInput(a)),
  },
];

describe('матрица прав §5.3 — персонажи', () => {
  for (const row of characterRows) {
    describe(row.action, () => {
      it.each(ACTORS)('%s', (actor) => {
        expect(row.check(actor)).toEqual(row.expected[actor]);
      });
    });
  }

  it('Прикрепить: владелец, не состоящий в целевой кампании, не может', () => {
    expect(canAttachCharacter(charInput('owner'), null)).toBe(false);
  });

  it('Персонаж вне кампании видит только владелец', () => {
    const solo = (a: Actor): CharacterAccessInput => ({
      ...charInput(a),
      character: { ownerId: USERS.owner.id, campaignId: null },
      viewerRole: null,
    });
    expect(ACTORS.map((a) => characterViewLevel(solo(a)))).toEqual(['full', 'none', 'none', 'none', 'none']);
  });
});

// ─── Заметки ──────────────────────────────────────────────────────────────

/** Автор заметки — игрок `owner`, кроме handout (автор — мастер). */
function noteInput(actor: Actor, visibility: NoteVisibility, authorActor: Actor = 'owner', recipients: Actor[] = []): NoteAccessInput {
  const u = USERS[actor];
  return {
    userId: u.id,
    isAdmin: u.isAdmin,
    note: { authorId: USERS[authorActor].id, campaignId: CAMPAIGN, visibility },
    viewerRole: u.role,
    isShareRecipient: recipients.includes(actor),
  };
}

type Access = 'none' | 'read' | 'edit';
const noteAccess = (i: NoteAccessInput): Access => (canEditNote(i) ? 'edit' : canViewNote(i) ? 'read' : 'none');

const noteRows: Row<Access>[] = [
  {
    action: 'Заметка private: только автор',
    expected: { owner: 'edit', otherPlayer: 'none', gm: 'none', coGm: 'none', admin: 'none' },
    check: (a) => noteAccess(noteInput(a, 'private')),
  },
  {
    action: 'Заметка gm: автор и мастер',
    expected: { owner: 'edit', otherPlayer: 'none', gm: 'edit', coGm: 'edit', admin: 'none' },
    check: (a) => noteAccess(noteInput(a, 'gm')),
  },
  {
    action: 'Заметка party: автор правит, игроки читают, мастер читает и правит',
    expected: { owner: 'edit', otherPlayer: 'read', gm: 'edit', coGm: 'edit', admin: 'none' },
    check: (a) => noteAccess(noteInput(a, 'party')),
  },
  {
    action: 'Handout (note_shares): адресат читает, автор-мастер правит',
    expected: { owner: 'none', otherPlayer: 'read', gm: 'edit', coGm: 'edit', admin: 'none' },
    // Мастер пишет заметку «для мастера» и отправляет её только otherPlayer.
    check: (a) => noteAccess(noteInput(a, 'gm', 'gm', ['otherPlayer'])),
  },
];

describe('матрица прав §5.3 — заметки', () => {
  for (const row of noteRows) {
    describe(row.action, () => {
      it.each(ACTORS)('%s', (actor) => {
        expect(row.check(actor)).toBe(row.expected[actor]);
      });
    });
  }

  it('в корзину отправляет только автор', () => {
    expect(ACTORS.map((a) => canTrashNote(noteInput(a, 'party')))).toEqual([true, false, false, false, false]);
  });

  it('отправить handout может автор-мастер кампании', () => {
    expect(canShareNote(noteInput('gm', 'gm', 'gm'))).toBe(true);
    expect(canShareNote(noteInput('owner', 'party', 'owner'))).toBe(false);
  });

  it('личная заметка вне кампании видна только автору', () => {
    const personal = (a: Actor): NoteAccessInput => ({
      ...noteInput(a, 'party'),
      note: { authorId: USERS.owner.id, campaignId: null, visibility: 'party' },
      viewerRole: null,
    });
    expect(ACTORS.map((a) => canViewNote(personal(a)))).toEqual([true, false, false, false, false]);
  });
});

// ─── Homebrew кампании ───────────────────────────────────────────────────

describe('матрица прав §5.3 — homebrew кампании', () => {
  const rows: Row<boolean>[] = [
    {
      action: 'предложить (статус proposed)',
      expected: { owner: true, otherPlayer: true, gm: true, coGm: true, admin: false },
      check: (a) => canHomebrew('propose', USERS[a].role),
    },
    {
      action: 'видеть одобренный',
      expected: { owner: true, otherPlayer: true, gm: true, coGm: true, admin: false },
      check: (a) => canHomebrew('view_approved', USERS[a].role),
    },
    {
      action: 'одобрить/отклонить',
      expected: { owner: false, otherPlayer: false, gm: true, coGm: true, admin: false },
      check: (a) => canHomebrew('review', USERS[a].role),
    },
    {
      action: 'создать в пакете кампании',
      expected: { owner: false, otherPlayer: false, gm: true, coGm: true, admin: false },
      check: (a) => canHomebrew('create', USERS[a].role),
    },
  ];
  for (const row of rows) {
    describe(row.action, () => {
      it.each(ACTORS)('%s', (actor) => {
        expect(row.check(actor)).toBe(row.expected[actor]);
      });
    });
  }
});

// ─── Роли в кампании (SPEC §5.2) ─────────────────────────────────────────

describe('роли кампании §5.2', () => {
  const roles: (CampaignRole | null)[] = ['gm', 'co_gm', 'player', null];
  const table: Record<string, boolean[]> = {
    view: [true, true, true, false],
    update_settings: [true, true, false, false],
    invite: [true, true, false, false],
    gm_panel: [true, true, false, false],
    remove_member: [true, true, false, false],
    archive: [true, false, false, false],
    set_role: [true, false, false, false],
  };
  for (const [action, expected] of Object.entries(table)) {
    it(`${action}: gm/co_gm/player/чужой`, () => {
      expect(roles.map((r) => canCampaign(action as Parameters<typeof canCampaign>[0], r))).toEqual(expected);
    });
  }
});
