import { TRPCError } from '@trpc/server';
import type { TRPC_ERROR_CODE_KEY } from '@trpc/server/unstable-core-do-not-import';

/**
 * Ошибка с ключом сообщения из `ru.errors` (SPEC §15: тексты — из i18n по коду).
 * `message` — ключ словаря, клиент переводит его через `errorMessage()`.
 */
export function appError(code: TRPC_ERROR_CODE_KEY, key?: string): TRPCError {
  return new TRPCError({ code, message: key ?? code });
}

export const forbidden = (key?: string) => appError('FORBIDDEN', key);
export const notFound = (key?: string) => appError('NOT_FOUND', key);
export const conflict = (key?: string) => appError('CONFLICT', key);
export const badRequest = (key?: string) => appError('BAD_REQUEST', key);
export const unauthorized = (key?: string) => appError('UNAUTHORIZED', key);

/** Ошибка правил из движка: текст движка передаётся клиенту в `data.engineMessage`. */
export class EngineRuleError extends Error {
  constructor(
    readonly code: string,
    readonly messageRu: string,
  ) {
    super(messageRu);
    this.name = 'EngineRuleError';
  }
}
