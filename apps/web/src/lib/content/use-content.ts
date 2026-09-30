'use client';
import { useQuery } from '@tanstack/react-query';
import type { ContentEntity } from '@ps/content-schema';
import { createContentIndex, type ContentIndex } from '@ps/rules-engine';

export type ClientContent = {
  index: ContentIndex;
  /** Не предлагать в выборе (удалено из источника или источник запрещён мастером). */
  hidden: Set<string>;
  packs: { key: string; name: string; version: string }[];
};

/**
 * Бандл контента кампании (или глобальный) → ContentIndex для расчёта листа в браузере
 * (SPEC §8.1). Повторные запросы браузер подтверждает по ETag (304).
 */
export function useContent(campaignId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['content-bundle', campaignId ?? 'global'],
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    structuralSharing: false,
    queryFn: async (): Promise<ClientContent> => {
      const res = await fetch(`/api/content/bundle${campaignId ? `?campaign=${campaignId}` : ''}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`bundle ${res.status}`);
      const body = (await res.json()) as { entities: ContentEntity[]; hidden: string[]; packs: ClientContent['packs'] };
      return { index: createContentIndex(body.entities), hidden: new Set(body.hidden), packs: body.packs };
    },
  });
}

/** Сущности вида для выбора: без скрытых, по алфавиту. */
export function selectable<K extends ContentEntity['kind']>(content: ClientContent, kind: K): ContentEntity<K>[] {
  return content.index
    .byKind(kind)
    .filter((e) => !content.hidden.has(e.key))
    .sort((a, b) => a.nameRu.localeCompare(b.nameRu, 'ru'));
}
