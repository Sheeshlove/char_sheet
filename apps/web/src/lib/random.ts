/** Криптостойкое случайное число в [0, 1) для бросков в приложении. */
export function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
}
