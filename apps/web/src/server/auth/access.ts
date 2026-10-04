/**
 * Матрица прав SPEC §5.3 в виде чистых функций (без БД).
 * Серверные гарды (`guards.ts`) загружают роль зрителя в кампании и вызывают эти функции.
 */

export type CampaignRole = 'gm' | 'co_gm' | 'player';
export type SheetVisibility = 'none' | 'summary' | 'full';
export type NoteVisibility = 'private' | 'gm' | 'party';

export const isGmRole = (role: CampaignRole | null | undefined): boolean => role === 'gm' || role === 'co_gm';

// ─── Персонажи ────────────────────────────────────────────────────────────

export type CharacterAccessInput = {
  userId: string;
  isAdmin: boolean;
  character: { ownerId: string; campaignId: string | null };
  /** Роль зрителя в кампании персонажа (null — не участник или персонаж вне кампании). */
  viewerRole: CampaignRole | null;
  /** `partySheetVisibility` кампании персонажа. */
  partySheetVisibility: SheetVisibility;
};

const isOwner = (i: CharacterAccessInput) => i.character.ownerId === i.userId;
const isCampaignGm = (i: CharacterAccessInput) => i.character.campaignId !== null && isGmRole(i.viewerRole);
const isOtherPlayer = (i: CharacterAccessInput) =>
  i.character.campaignId !== null && i.viewerRole === 'player' && !isOwner(i);

/** Видеть лист: владелец и мастер — полностью; другой игрок — по `partySheetVisibility`; админ — нет. */
export function characterViewLevel(i: CharacterAccessInput): SheetVisibility {
  if (isOwner(i) || isCampaignGm(i)) return 'full';
  if (isOtherPlayer(i)) return i.partySheetVisibility;
  return 'none';
}

/** Менять build: владелец; мастер/со-мастер (с записью в журнал). */
export function canEditCharacterBuild(i: CharacterAccessInput): boolean {
  return isOwner(i) || isCampaignGm(i);
}

/** Менять state (хиты, ячейки…): владелец; мастер/со-мастер. */
export function canEditCharacterState(i: CharacterAccessInput): boolean {
  return isOwner(i) || isCampaignGm(i);
}

/** Выдать опыт/предмет/состояние: только мастер/со-мастер кампании. */
export function canGrantToCharacter(i: CharacterAccessInput): boolean {
  return isCampaignGm(i);
}

/**
 * Прикрепить к кампании: только владелец и только если он участник целевой кампании.
 * `targetRole` — роль владельца в целевой кампании.
 */
export function canAttachCharacter(i: CharacterAccessInput, targetRole: CampaignRole | null): boolean {
  return isOwner(i) && targetRole !== null;
}

/** Отвязать от кампании: владелец или мастер/со-мастер этой кампании. */
export function canDetachCharacter(i: CharacterAccessInput): boolean {
  return i.character.campaignId !== null && (isOwner(i) || isCampaignGm(i));
}

/** Удалить (в архив): только владелец. */
export function canArchiveCharacter(i: CharacterAccessInput): boolean {
  return isOwner(i);
}

// ─── Заметки ──────────────────────────────────────────────────────────────

export type NoteAccessInput = {
  userId: string;
  isAdmin: boolean;
  note: { authorId: string; campaignId: string | null; visibility: NoteVisibility };
  /** Роль зрителя в кампании заметки. */
  viewerRole: CampaignRole | null;
  /** Зритель — адресат раздаточного материала (`note_shares`). */
  isShareRecipient: boolean;
};

const isAuthor = (i: NoteAccessInput) => i.note.authorId === i.userId;
const noteGm = (i: NoteAccessInput) => i.note.campaignId !== null && isGmRole(i.viewerRole);
const noteMember = (i: NoteAccessInput) => i.note.campaignId !== null && i.viewerRole !== null;

export function canViewNote(i: NoteAccessInput): boolean {
  if (isAuthor(i)) return true;
  if (i.isShareRecipient) return true; // handout: адресат читает
  switch (i.note.visibility) {
    case 'private':
      return false;
    case 'gm':
      return noteGm(i);
    case 'party':
      return noteMember(i);
  }
}

export function canEditNote(i: NoteAccessInput): boolean {
  if (isAuthor(i)) return true;
  switch (i.note.visibility) {
    case 'private':
      return false;
    case 'gm':
      return noteGm(i);
    case 'party':
      return noteGm(i);
  }
}

/** Удалить (в корзину) может только автор. */
export function canTrashNote(i: NoteAccessInput): boolean {
  return isAuthor(i);
}

/** Отправить handout: автор-мастер кампании. */
export function canShareNote(i: NoteAccessInput): boolean {
  return isAuthor(i) && noteGm(i);
}

// ─── Homebrew кампании ───────────────────────────────────────────────────

export type HomebrewAction = 'propose' | 'view_approved' | 'review' | 'create';

export function canHomebrew(action: HomebrewAction, viewerRole: CampaignRole | null): boolean {
  switch (action) {
    case 'propose':
      return viewerRole !== null; // игрок предлагает, мастер может и сам создать
    case 'view_approved':
      return viewerRole !== null;
    case 'review':
    case 'create':
      return isGmRole(viewerRole);
  }
}

// ─── Кампании ─────────────────────────────────────────────────────────────

export type CampaignAction =
  | 'view'
  | 'update'
  | 'update_settings'
  | 'invite'
  | 'archive'
  | 'set_role'
  | 'remove_member'
  | 'gm_panel';

/** Со-мастер: права мастера, кроме удаления (архивации) кампании и смены ролей (SPEC §5.2). */
export function canCampaign(action: CampaignAction, role: CampaignRole | null): boolean {
  if (role === null) return false;
  switch (action) {
    case 'view':
      return true;
    case 'update':
    case 'update_settings':
    case 'invite':
    case 'remove_member':
    case 'gm_panel':
      return isGmRole(role);
    case 'archive':
    case 'set_role':
      return role === 'gm';
  }
}
