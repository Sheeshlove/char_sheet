import { describe, expect, it } from 'vitest';
import { checkSiteInvite, siteInviteStatus } from './invites';

const now = new Date('2026-01-10T00:00:00Z');
const base = { usedBy: null, expiresAt: null, revokedAt: null };

describe('checkSiteInvite (SPEC §5.1, M1)', () => {
  it('без приглашения регистрация невозможна', () => {
    expect(checkSiteInvite(undefined, now)).toBe('inviteInvalid');
    expect(checkSiteInvite(null, now)).toBe('inviteInvalid');
  });
  it('использованное приглашение отклоняется', () => {
    expect(checkSiteInvite({ ...base, usedBy: 'u1' }, now)).toBe('inviteUsed');
  });
  it('просроченное приглашение отклоняется', () => {
    expect(checkSiteInvite({ ...base, expiresAt: new Date('2026-01-09T00:00:00Z') }, now)).toBe('inviteExpired');
  });
  it('отозванное приглашение недействительно', () => {
    expect(checkSiteInvite({ ...base, revokedAt: now }, now)).toBe('inviteInvalid');
  });
  it('действующее приглашение принимается', () => {
    expect(checkSiteInvite(base, now)).toBeNull();
    expect(checkSiteInvite({ ...base, expiresAt: new Date('2026-02-01T00:00:00Z') }, now)).toBeNull();
    expect(siteInviteStatus(base, now)).toBe('active');
  });
});
