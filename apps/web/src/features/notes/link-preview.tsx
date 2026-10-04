'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { docText } from '@/lib/notes/doc';

const N = ru.notes;
const SHOW_DELAY_MS = 350;

type Target = { targetType: 'note' | 'character' | 'content'; targetId: string; rect: DOMRect };

/** Цель ссылки по DOM-элементу редактора (`data-*` узлов) или просмотра (`data-link-*`). */
function targetOf(el: Element | null): Omit<Target, 'rect'> | null {
  const node = el?.closest('[data-type="wiki-link"], [data-type="mention"], [data-link-type]');
  if (!node) return null;
  if (node.getAttribute('data-type') === 'wiki-link') {
    const id = node.getAttribute('data-note-id');
    return id ? { targetType: 'note', targetId: id } : null;
  }
  const type = node.getAttribute('data-target-type') ?? node.getAttribute('data-link-type');
  const id = node.getAttribute('data-target-id') ?? node.getAttribute('data-link-id');
  if (!id || (type !== 'note' && type !== 'character' && type !== 'content')) return null;
  return { targetType: type, targetId: id };
}

/**
 * Карточка-превью по наведению на WikiLink/Mention (SPEC §11.1). Оборачивает область,
 * слушает `mouseover`; содержимое грузится только для показанной цели.
 */
export function LinkPreviewArea({ children, className }: { children: React.ReactNode; className?: string }) {
  const [target, setTarget] = useState<Target | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <div
      className={className}
      onMouseOver={(e) => {
        const t = targetOf(e.target as Element);
        if (timer.current) clearTimeout(timer.current);
        if (!t) {
          setTarget(null);
          return;
        }
        const el = (e.target as Element).closest('[data-type], [data-link-type]')!;
        timer.current = setTimeout(() => setTarget({ ...t, rect: el.getBoundingClientRect() }), SHOW_DELAY_MS);
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current);
        setTarget(null);
      }}
    >
      {children}
      {target && <PreviewCard target={target} />}
    </div>
  );
}

function PreviewCard({ target }: { target: Target }) {
  const trpc = useTRPC();
  const note = useQuery({ ...trpc.notes.get.queryOptions({ noteId: target.targetId }), enabled: target.targetType === 'note', staleTime: 30_000, retry: false });
  const character = useQuery({
    ...trpc.characters.get.queryOptions({ characterId: target.targetId }),
    enabled: target.targetType === 'character',
    staleTime: 30_000,
    retry: false,
  });
  const content = useQuery({ ...trpc.content.get.queryOptions({ key: target.targetId }), enabled: target.targetType === 'content', staleTime: 300_000, retry: false });
  let title = '';
  let kind = '';
  let text = '';
  if (target.targetType === 'note' && note.data) {
    title = note.data.title || N.untitled;
    kind = N.types[note.data.type] ?? '';
    text = docText(note.data.body);
  } else if (target.targetType === 'character' && character.data) {
    const s = character.data.summary;
    title = character.data.name;
    kind = N.character;
    text = s ? `${s.raceLabelRu} · ${s.classLabelRu} ${s.level} · ${ru.sheet.ac} ${s.ac} · ${ru.sheet.hp} ${s.hp.current}/${s.hp.max}` : '';
  } else if (target.targetType === 'content' && content.data) {
    title = content.data.nameRu;
    kind = ru.library.kinds[content.data.kind] ?? '';
    text = content.data.textMd.replace(/[#*_>|`[\]]/g, '');
  }
  const failed = note.isError || character.isError || content.isError;
  if (!title && !failed) return null;
  const top = Math.min(target.rect.bottom + 6, window.innerHeight - 180);
  const left = Math.min(target.rect.left, window.innerWidth - 340);
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 w-80 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md"
      style={{ top, left: Math.max(8, left) }}
      data-testid="link-preview"
    >
      {failed ? (
        <p className="text-muted-foreground">{ru.errors.NOT_FOUND}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">{title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{kind}</span>
          </div>
          {text && <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{text.slice(0, 400)}</p>}
        </>
      )}
    </div>
  );
}
