'use client';
import { createContext, useContext } from 'react';
import type { CharacterBuild, StateCommand } from '@ps/content-schema';
import type { ComputedSheet, ContentIndex } from '@ps/rules-engine';
import type { FullCharacter } from '../use-character';

export type SheetContextValue = {
  characterId: string;
  character: FullCharacter;
  sheet: ComputedSheet;
  index: ContentIndex | null;
  /** Команда игрового состояния (оптимистично). */
  run: (command: StateCommand, opts?: { onDone?: () => void }) => void;
  busy: boolean;
  /** Сохранение сборки (переопределения, подготовка через build не нужна). */
  saveBuild: (build: CharacterBuild) => Promise<boolean>;
  canEdit: boolean;
  canEditState: boolean;
};

const Ctx = createContext<SheetContextValue | null>(null);

export const SheetProvider = Ctx.Provider;

export function useSheet(): SheetContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('SheetProvider missing');
  return v;
}
