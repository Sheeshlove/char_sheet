import { describe, expect, it } from 'vitest';
import { isSameOrigin } from './origin';

const req = (headers: Record<string, string>) => new Request('http://localhost:3000/api/trpc/x', { method: 'POST', headers });

describe('isSameOrigin (CSRF, SPEC §5.1)', () => {
  it('принимает Origin, совпадающий с APP_URL', () => {
    expect(isSameOrigin(req({ origin: 'https://sheet.example' }), 'https://sheet.example')).toBe(true);
  });
  it('отклоняет чужой Origin', () => {
    expect(isSameOrigin(req({ origin: 'https://evil.example' }), 'https://sheet.example')).toBe(false);
  });
  it('без Origin отклоняет межсайтовый запрос и пропускает прочие', () => {
    expect(isSameOrigin(req({ 'sec-fetch-site': 'cross-site' }), 'https://sheet.example')).toBe(false);
    expect(isSameOrigin(req({}), 'https://sheet.example')).toBe(true);
  });
});
