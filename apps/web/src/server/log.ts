import pino from 'pino';

/**
 * Серверные логи (SPEC §16.3): JSON в stdout, уровень — `LOG_LEVEL`. Пароли, токены, cookie
 * и тела заметок не пишутся: в лог передаются только коды, пути и сообщения об ошибках,
 * а на случай ошибки — ещё и маскирование известных полей.
 */
export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'party-sheet' },
  redact: {
    paths: [
      'password',
      'newPassword',
      'passwordHash',
      'token',
      'cookie',
      'content',
      'contentText',
      '*.password',
      '*.newPassword',
      '*.passwordHash',
      '*.token',
      '*.cookie',
      '*.content',
      '*.contentText',
      'headers.cookie',
      'headers.authorization',
    ],
    censor: '[скрыто]',
  },
});

/** Ошибка → поля лога без входных данных запроса. */
export function errorFields(e: unknown): { err: { message: string; stack?: string; code?: string } } {
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return { err: { message: e.message, stack: e.stack, ...(typeof code === 'string' ? { code } : {}) } };
  }
  return { err: { message: String(e) } };
}
