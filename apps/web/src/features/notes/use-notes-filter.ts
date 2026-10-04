'use client';
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NOTE_SORTS, NOTE_TYPES, NOTE_VISIBILITIES, noteFilterSchema, type NoteFilter } from '@/lib/notes/schema';

/** Фильтр списка заметок хранится в адресе: его можно сохранить, отправить ссылкой и вернуться назад. */

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const UUID = /^[0-9a-f-]{36}$/i;

export type NotesView = { filter: NoteFilter; trashed: boolean; tagMode: 'all' | 'any' };

export function parseNotesParams(sp: URLSearchParams): NotesView {
  const tagMode = sp.get('tagMode') === 'any' ? 'any' : 'all';
  const tags = list(sp.get('tags')).filter((t) => UUID.test(t));
  const sort = sp.get('sort');
  const char = sp.get('char');
  const filter = noteFilterSchema.parse({
    types: list(sp.get('type')).filter((t) => (NOTE_TYPES as readonly string[]).includes(t)),
    visibility: list(sp.get('vis')).filter((t) => (NOTE_VISIBILITIES as readonly string[]).includes(t)),
    tagsAll: tagMode === 'all' ? tags : [],
    tagsAny: tagMode === 'any' ? tags : [],
    sessionFrom: num(sp.get('from')),
    sessionTo: num(sp.get('to')),
    characterId: char && UUID.test(char) ? char : undefined,
    text: sp.get('q')?.slice(0, 200) || undefined,
    pinned: sp.get('pinned') === '1' || undefined,
    handouts: sp.get('handouts') === '1' || undefined,
    sort: sort && (NOTE_SORTS as readonly string[]).includes(sort) ? sort : 'updated',
  });
  return { filter, trashed: sp.get('trash') === '1', tagMode };
}

/** Фильтр → параметры адреса (пустые значения опускаются). */
export function notesParams(v: NotesView): URLSearchParams {
  const sp = new URLSearchParams();
  const f = v.filter;
  const tags = [...f.tagsAll, ...f.tagsAny];
  if (f.text) sp.set('q', f.text);
  if (f.types.length) sp.set('type', f.types.join(','));
  if (tags.length) sp.set('tags', tags.join(','));
  if (tags.length && v.tagMode === 'any') sp.set('tagMode', 'any');
  if (f.visibility.length) sp.set('vis', f.visibility.join(','));
  if (f.sessionFrom !== undefined) sp.set('from', String(f.sessionFrom));
  if (f.sessionTo !== undefined) sp.set('to', String(f.sessionTo));
  if (f.characterId) sp.set('char', f.characterId);
  if (f.pinned) sp.set('pinned', '1');
  if (f.handouts) sp.set('handouts', '1');
  if (f.sort !== 'updated') sp.set('sort', f.sort);
  if (v.trashed) sp.set('trash', '1');
  return sp;
}

export function useNotesFilter() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = sp.toString();
  const view = useMemo(() => parseNotesParams(new URLSearchParams(key)), [key]);
  const setView = useCallback(
    (next: NotesView | ((v: NotesView) => NotesView)) => {
      const v = typeof next === 'function' ? next(parseNotesParams(new URLSearchParams(key))) : next;
      const qs = notesParams(v).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, key],
  );
  return { view, setView, query: key };
}

export const EMPTY_VIEW: NotesView = { filter: noteFilterSchema.parse({}), trashed: false, tagMode: 'all' };
