'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import type { inferRouterInputs } from '@trpc/server';
import { toast } from 'sonner';
import type { AppRouter } from '@/server/trpc/routers/_app';
import { trpcErrorText, useTRPC, useTRPCClient } from '@/lib/trpc/client';

export type NotePatch = inferRouterInputs<AppRouter>['notes']['update']['patch'];
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Задержка автосохранения (SPEC §11.1). */
export const AUTOSAVE_MS = 1500;

/**
 * Автосохранение заметки: изменения копятся в патче и уходят через 1,5 с тишины
 * с `expectedUpdatedAt`; запросы идут строго по очереди. При конфликте версий
 * несохранённый патч отдаётся наружу (диалог «моя / их / копия»).
 */
export function useNoteAutosave(noteId: string, updatedAt: Date) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const pending = useRef<NotePatch>({});
  const expected = useRef(updatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [conflict, setConflict] = useState<NotePatch | null>(null);
  const blocked = useRef(false);

  const flush = useCallback((): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const run = chain.current.then(async () => {
      const patch = pending.current;
      if (blocked.current || !Object.keys(patch).length) return;
      pending.current = {};
      setStatus('saving');
      try {
        const res = await client.notes.update.mutate({ noteId, expectedUpdatedAt: expected.current, patch });
        expected.current = res.updatedAt;
        void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
        void qc.invalidateQueries({ queryKey: trpc.notes.counts.queryKey() });
        setStatus(Object.keys(pending.current).length ? 'dirty' : 'saved');
      } catch (e) {
        pending.current = { ...patch, ...pending.current };
        if (e instanceof TRPCClientError && (e.data as { code?: string } | undefined)?.code === 'CONFLICT') {
          blocked.current = true;
          setConflict(pending.current);
          setStatus('error');
          return;
        }
        setStatus('error');
        toast.error(trpcErrorText(e));
      }
    });
    chain.current = run.catch(() => undefined);
    return run;
  }, [client, noteId, qc, trpc]);

  const schedule = useCallback(
    (patch: NotePatch) => {
      pending.current = { ...pending.current, ...patch };
      setStatus('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  /** Разрешение конфликта: `mine` — перезаписать актуальную версию моими данными (`full`). */
  const resolve = useCallback(
    async (how: 'mine' | 'theirs' | 'drop', full?: NotePatch) => {
      if (how === 'mine') {
        const cur = await client.notes.get.query({ noteId });
        expected.current = cur.updatedAt;
        pending.current = { ...full, ...pending.current };
      } else {
        pending.current = {};
      }
      blocked.current = false;
      setConflict(null);
      if (how === 'mine') await flush();
      else setStatus('idle');
    },
    [client, flush, noteId],
  );

  /** Принять новую версию с сервера (после «взять их версию»). */
  const rebase = useCallback((at: Date) => {
    expected.current = at;
  }, []);

  // Уход со страницы или переключение заметки — сохранить сразу.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length && !blocked.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void flush();
    };
  }, [flush]);

  return { schedule, flush, status, conflict, resolve, rebase };
}
