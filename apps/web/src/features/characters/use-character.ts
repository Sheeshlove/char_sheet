'use client';
import { useCallback, useDeferredValue, useMemo, useRef } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import { toast } from 'sonner';
import type { CharacterBuild, StateCommand } from '@ps/content-schema';
import { applyCommand, CommandError, compute, type ComputedSheet, type ContentIndex, type EngineEvent } from '@ps/rules-engine';
import type { AppRouter } from '@/server/trpc/routers/_app';
import { trpcErrorText, useTRPC } from '@/lib/trpc/client';
import { useContent } from '@/lib/content/use-content';
import { useIdleReady } from '@/lib/use-idle-ready';
import { ru } from '@/i18n/ru';

type Outputs = inferRouterOutputs<AppRouter>;
export type CharacterView = Outputs['characters']['get'];
export type FullCharacter = Extract<CharacterView, { access: 'full' }>;

/** Опрос открытого листа (SPEC §2: реальное время — опрос раз в 5 секунд). */
const LIVE_POLL_MS = 5000;

/**
 * Персонаж с живым расчётом: лист считается в браузере по бандлу контента кампании;
 * пока бандл грузится — используется лист, посчитанный сервером. `live` — опрашивать
 * сервер, пока лист открыт (кроме моментов, когда своя команда ещё в пути).
 */
export function useCharacter(characterId: string, opts?: { live?: boolean }) {
  const trpc = useTRPC();
  const commandsInFlight = useIsMutating({ mutationKey: trpc.characters.command.mutationKey() });
  const query = useQuery({
    ...trpc.characters.get.queryOptions({ characterId }),
    refetchInterval: opts?.live && commandsInFlight === 0 ? LIVE_POLL_MS : false,
  });
  const full = query.data?.access === 'full' ? query.data : null;
  // Бандл контента грузится, когда лист уже гидрирован и браузер свободен; до этого
  // показывается расчёт сервера из того же ответа.
  const idle = useIdleReady();
  const content = useContent(full?.campaign?.id ?? null, !!full && idle);
  // Пересчёт по пришедшему бандлу — фоновым рендером с разбивкой на кусочки, чтобы не
  // блокировать ввод на телефоне (SPEC §16.5); до него показывается расчёт сервера.
  const contentData = useDeferredValue(content.data);
  const sheet: ComputedSheet | null = useMemo(() => {
    if (!full) return null;
    if (!contentData) return full.sheet;
    try {
      return compute(full.build, full.state, contentData.index, full.rules);
    } catch {
      return full.sheet;
    }
  }, [full, contentData]);
  return { query, character: query.data, full, content, index: contentData?.index ?? null, sheet };
}

/** Обновление полного персонажа в кэше (краткую карточку не трогаем). */
export function patchFull(old: CharacterView | undefined, patch: Partial<FullCharacter>): CharacterView | undefined {
  return old && old.access === 'full' ? ({ ...old, ...patch } as FullCharacter) : old;
}

function engineMessage(e: unknown): string | null {
  if (e instanceof CommandError) return e.message;
  return null;
}

const EVENT_TEXT: Partial<Record<EngineEvent['type'], (e: EngineEvent) => string>> = {
  concentration_check: (e) => ru.sheet.events.concentration((e as { dc: number }).dc),
  dropped_to_zero: () => ru.sheet.events.droppedToZero,
  died: () => ru.sheet.events.died,
  stabilized: () => ru.sheet.events.stabilized,
  revived: () => ru.sheet.events.revived,
  concentration_ended: () => ru.sheet.events.concentrationEnded,
  level_up_available: () => ru.sheet.events.levelUpAvailable,
};

/** Уведомления о событиях движка (проверка концентрации, падение до 0 и т. п.). */
export function announceEvents(events: EngineEvent[]) {
  for (const e of events) {
    const text = EVENT_TEXT[e.type]?.(e);
    if (text) (e.type === 'died' || e.type === 'dropped_to_zero' ? toast.warning : toast.info)(text);
  }
}

/**
 * Команда игрового состояния с оптимистичным применением: движок применяет её локально
 * (ошибка правил показывается сразу), сервер применяет к актуальному состоянию и
 * возвращает итог — он и остаётся в кэше.
 */
export function useCharacterCommand(characterId: string, index: ContentIndex | null | undefined) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  // Стабильные ключ и функции: иначе контекст листа меняется на каждом рендере и весь лист
  // перерисовывается синхронно при любом обновлении запросов (SPEC §16.5).
  const key = useMemo(() => trpc.characters.get.queryKey({ characterId }), [trpc, characterId]);
  const content = useRef(index ?? null);
  content.current = index ?? null;
  const mutation = useMutation(
    trpc.characters.command.mutationOptions({
      onSuccess: (res) => {
        qc.setQueryData(key, (old) => patchFull(old, { state: res.state, version: res.version }));
        announceEvents(res.events);
      },
      onError: () => {
        void qc.invalidateQueries({ queryKey: key });
      },
    }),
  );
  const { mutate } = mutation;
  const run = useCallback(
    (command: StateCommand, opts?: { onDone?: () => void }) => {
      // Без сети лист только для просмотра (SPEC §16.4): команда не применяется даже локально.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.error(ru.errors.offlineMutation);
        return;
      }
      // Устаревший ответ опроса не должен затереть оптимистичное состояние.
      void qc.cancelQueries({ queryKey: key });
      const cur = qc.getQueryData(key);
      const index = content.current;
      if (cur && cur.access === 'full' && index) {
        try {
          const local = applyCommand(cur.build, cur.state, command, index, cur.rules);
          qc.setQueryData(key, patchFull(cur, { state: local.state }));
        } catch (e) {
          const msg = engineMessage(e);
          if (msg) {
            toast.error(msg);
            return;
          }
        }
      }
      mutate({ characterId, command }, { onSuccess: () => opts?.onDone?.() });
    },
    [qc, key, content, mutate, characterId],
  );
  return { run, isPending: mutation.isPending };
}

/**
 * Сохранение сборки с `expectedVersion`. Сохранения идут строго по очереди; при
 * конфликте версий данные перезагружаются.
 */
export function useSaveBuild(characterId: string) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const key = useMemo(() => trpc.characters.get.queryKey({ characterId }), [trpc, characterId]);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const mutation = useMutation(trpc.characters.updateBuild.mutationOptions({ meta: { silent: true } }));
  const { mutateAsync } = mutation;

  const save = useCallback(
    (build: CharacterBuild): Promise<boolean> => {
      const run = chain.current.then(async () => {
        const cur = qc.getQueryData(key);
        if (!cur || cur.access !== 'full') return false;
        try {
          const res = await mutateAsync({ characterId, build, expectedVersion: cur.version });
          qc.setQueryData(key, (old) => patchFull(old, { build, state: res.state, version: res.version, name: res.name }));
          return true;
        } catch (e) {
          if (e instanceof TRPCClientError && (e.data as { code?: string } | undefined)?.code === 'CONFLICT') {
            toast.error(ru.errors.version_conflict);
            await qc.invalidateQueries({ queryKey: key });
          } else {
            toast.error(trpcErrorText(e));
          }
          return false;
        }
      });
      chain.current = run.catch(() => undefined);
      return run;
    },
    [qc, key, mutateAsync, characterId],
  );
  return { save, isSaving: mutation.isPending };
}
