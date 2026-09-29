/**
 * Проверка Origin для мутаций (SPEC §5.1): Origin должен совпадать с APP_URL.
 * Если Origin нет, запрос отклоняется, только когда браузер пометил его как межсайтовый.
 */
export function isSameOrigin(req: Request, appUrl = process.env.APP_URL ?? 'http://localhost:3000'): boolean {
  const origin = req.headers.get('origin');
  let expected: string;
  try {
    expected = new URL(appUrl).origin;
  } catch {
    return false;
  }
  if (origin) return origin === expected;
  const site = req.headers.get('sec-fetch-site');
  return site !== 'cross-site';
}
