/**
 * Ограничение неудачных попыток входа: не более 10 за 15 минут на пару IP+логин (SPEC §5.1).
 * Счётчик в памяти процесса — допустимо для одного инстанса.
 */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export class LoginRateLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly max = LOGIN_MAX_FAILURES,
    private readonly windowMs = LOGIN_WINDOW_MS,
  ) {}

  private key(ip: string, login: string) {
    return `${ip}|${login.trim().toLowerCase()}`;
  }

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** true — попытка заблокирована (уже набрано `max` неудач в окне). */
  isBlocked(ip: string, login: string, now = Date.now()): boolean {
    return this.recent(this.key(ip, login), now).length >= this.max;
  }

  recordFailure(ip: string, login: string, now = Date.now()): void {
    const key = this.key(ip, login);
    const list = this.recent(key, now);
    list.push(now);
    this.failures.set(key, list);
  }

  reset(ip: string, login: string): void {
    this.failures.delete(this.key(ip, login));
  }
}

const globalForLimiter = globalThis as unknown as { __psLoginLimiter?: LoginRateLimiter };
export const loginLimiter = (globalForLimiter.__psLoginLimiter ??= new LoginRateLimiter());
