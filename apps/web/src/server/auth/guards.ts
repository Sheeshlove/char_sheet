import { and, eq } from 'drizzle-orm';
import type { Context } from '../trpc/context';
import { campaignMembers, campaigns, noteShares } from '../db/schema';
import { forbidden, notFound, unauthorized } from '../trpc/errors';
import type { AuthUser } from './session';
import {
  canEditCharacterBuild,
  canEditNote as canEditNotePure,
  canViewNote as canViewNotePure,
  characterViewLevel,
  type CampaignRole,
  type CharacterAccessInput,
  type NoteAccessInput,
  type NoteVisibility,
  type SheetVisibility,
} from './access';

type Ctx = Pick<Context, 'db' | 'user'>;

export function requireUser(ctx: Pick<Context, 'user'>): AuthUser {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}

export function requireAdmin(ctx: Pick<Context, 'user'>): AuthUser {
  const user = requireUser(ctx);
  if (!user.isAdmin) throw forbidden();
  return user;
}

export async function getCampaignRole(
  ctx: Ctx,
  campaignId: string | null | undefined,
  userId?: string,
): Promise<CampaignRole | null> {
  const uid = userId ?? ctx.user?.id;
  if (!campaignId || !uid) return null;
  const rows = await ctx.db
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, uid)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/** Требует роль из `roles` в кампании; иначе FORBIDDEN (или NOT_FOUND, если не участник). */
export async function requireCampaignRole(
  ctx: Ctx,
  campaignId: string,
  roles: readonly CampaignRole[] = ['gm', 'co_gm', 'player'],
): Promise<CampaignRole> {
  requireUser(ctx);
  const role = await getCampaignRole(ctx, campaignId);
  if (!role) throw notFound();
  if (!roles.includes(role)) throw forbidden();
  return role;
}

async function partyVisibility(ctx: Ctx, campaignId: string | null): Promise<SheetVisibility> {
  if (!campaignId) return 'none';
  const rows = await ctx.db
    .select({ settings: campaigns.settings })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  const s = rows[0]?.settings as { partySheetVisibility?: SheetVisibility } | undefined;
  return s?.partySheetVisibility ?? 'summary';
}

export async function characterAccessInput(
  ctx: Ctx,
  character: { ownerId: string; campaignId: string | null },
): Promise<CharacterAccessInput> {
  const user = requireUser(ctx);
  const [viewerRole, vis] = await Promise.all([
    getCampaignRole(ctx, character.campaignId),
    partyVisibility(ctx, character.campaignId),
  ]);
  return { userId: user.id, isAdmin: user.isAdmin, character, viewerRole, partySheetVisibility: vis };
}

export async function canViewCharacter(
  ctx: Ctx,
  character: { ownerId: string; campaignId: string | null },
): Promise<SheetVisibility> {
  return characterViewLevel(await characterAccessInput(ctx, character));
}

export async function canEditCharacter(
  ctx: Ctx,
  character: { ownerId: string; campaignId: string | null },
): Promise<boolean> {
  return canEditCharacterBuild(await characterAccessInput(ctx, character));
}

export async function noteAccessInput(
  ctx: Ctx,
  note: { id: string; authorId: string; campaignId: string | null; visibility: NoteVisibility },
): Promise<NoteAccessInput> {
  const user = requireUser(ctx);
  const [viewerRole, share] = await Promise.all([
    getCampaignRole(ctx, note.campaignId),
    ctx.db
      .select({ noteId: noteShares.noteId })
      .from(noteShares)
      .where(and(eq(noteShares.noteId, note.id), eq(noteShares.userId, user.id)))
      .limit(1),
  ]);
  return {
    userId: user.id,
    isAdmin: user.isAdmin,
    note,
    viewerRole,
    isShareRecipient: share.length > 0,
  };
}

export async function canViewNote(
  ctx: Ctx,
  note: { id: string; authorId: string; campaignId: string | null; visibility: NoteVisibility },
): Promise<boolean> {
  return canViewNotePure(await noteAccessInput(ctx, note));
}

export async function canEditNote(
  ctx: Ctx,
  note: { id: string; authorId: string; campaignId: string | null; visibility: NoteVisibility },
): Promise<boolean> {
  return canEditNotePure(await noteAccessInput(ctx, note));
}
