export type SiteInviteState = {
  usedBy: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type InviteProblem = 'inviteInvalid' | 'inviteUsed' | 'inviteExpired';

/** Проверка приглашения на сайт: null — годен, иначе ключ ошибки из `ru.errors`. */
export function checkSiteInvite(invite: SiteInviteState | undefined | null, now = new Date()): InviteProblem | null {
  if (!invite || invite.revokedAt) return 'inviteInvalid';
  if (invite.usedBy) return 'inviteUsed';
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return 'inviteExpired';
  return null;
}

export type SiteInviteStatus = 'active' | 'used' | 'expired' | 'revoked';

export function siteInviteStatus(invite: SiteInviteState, now = new Date()): SiteInviteStatus {
  if (invite.revokedAt) return 'revoked';
  if (invite.usedBy) return 'used';
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}
