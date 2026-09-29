import { describe, expect, it } from 'vitest';
import { LoginRateLimiter } from './rate-limit';

describe('LoginRateLimiter (SPEC §5.1)', () => {
  it('блокирует 11-ю попытку после 10 неудач за 15 минут', () => {
    const rl = new LoginRateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(rl.isBlocked('1.1.1.1', 'bob', t0 + i)).toBe(false);
      rl.recordFailure('1.1.1.1', 'bob', t0 + i);
    }
    expect(rl.isBlocked('1.1.1.1', 'bob', t0 + 11)).toBe(true);
  });

  it('счётчик раздельный для IP и логина, логин без учёта регистра', () => {
    const rl = new LoginRateLimiter(2);
    rl.recordFailure('ip', 'Bob');
    rl.recordFailure('ip', 'bob ');
    expect(rl.isBlocked('ip', 'BOB')).toBe(true);
    expect(rl.isBlocked('ip2', 'bob')).toBe(false);
    expect(rl.isBlocked('ip', 'alice')).toBe(false);
  });

  it('окно скользит: старые неудачи забываются через 15 минут', () => {
    const rl = new LoginRateLimiter();
    for (let i = 0; i < 10; i++) rl.recordFailure('ip', 'x', 0);
    expect(rl.isBlocked('ip', 'x', 15 * 60 * 1000 - 1)).toBe(true);
    expect(rl.isBlocked('ip', 'x', 15 * 60 * 1000)).toBe(false);
  });

  it('reset снимает блокировку после успешного входа', () => {
    const rl = new LoginRateLimiter(1);
    rl.recordFailure('ip', 'x');
    rl.reset('ip', 'x');
    expect(rl.isBlocked('ip', 'x')).toBe(false);
  });
});
