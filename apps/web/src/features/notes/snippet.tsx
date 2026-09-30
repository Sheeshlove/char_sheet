import { Fragment } from 'react';

/** Сниппет поиска: совпадения между маркерами \u0001…\u0002 → <mark>. */
export function Snippet({ text, className }: { text: string; className?: string }) {
  const START = String.fromCharCode(1);
  const END = String.fromCharCode(2);
  const parts: { text: string; hit: boolean }[] = [];
  let rest = text;
  while (rest) {
    const a = rest.indexOf(START);
    if (a < 0) {
      parts.push({ text: rest, hit: false });
      break;
    }
    const b = rest.indexOf(END, a + 1);
    if (a > 0) parts.push({ text: rest.slice(0, a), hit: false });
    parts.push({ text: rest.slice(a + 1, b < 0 ? undefined : b), hit: true });
    rest = b < 0 ? '' : rest.slice(b + 1);
  }
  return (
    <span className={className}>
      {parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>))}
    </span>
  );
}
