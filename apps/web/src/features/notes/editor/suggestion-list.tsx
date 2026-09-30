'use client';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { cn } from '@/lib/utils';

export type SuggestionItem = {
  key: string;
  label: string;
  hint?: string;
  group?: string;
  /** Пункт-действие («Создать заметку «X»»). */
  create?: boolean;
};

export type SuggestionListHandle = { onKeyDown: (e: KeyboardEvent) => boolean };

type Props = {
  items: SuggestionItem[];
  loading?: boolean;
  empty: string;
  command: (item: SuggestionItem) => void;
};

/** Выпадающий список подсказок редактора (`[[` и `@`): стрелки, Enter/Tab, Escape. */
export const SuggestionList = forwardRef<SuggestionListHandle, Props>(function SuggestionList({ items, loading, empty, command }, ref) {
  const [active, setActive] = useState(0);
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setActive(0);
  }
  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (!items.length) return false;
      if (e.key === 'ArrowDown') {
        setActive((i) => (i + 1) % items.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        setActive((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const item = items[active];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));
  let lastGroup: string | undefined;
  return (
    <div
      role="listbox"
      className="max-h-72 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      data-testid="editor-suggestions"
    >
      {!items.length && <div className="px-2 py-1.5 text-muted-foreground">{loading ? '…' : empty}</div>}
      {items.map((it, i) => {
        const header = it.group && it.group !== lastGroup ? it.group : null;
        lastGroup = it.group;
        return (
          <div key={it.key}>
            {header && <div className="px-2 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">{header}</div>}
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left',
                i === active && 'bg-accent text-accent-foreground',
                it.create && 'italic',
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                command(it);
              }}
            >
              <span className="truncate">{it.label}</span>
              {it.hint && <span className="shrink-0 text-xs text-muted-foreground">{it.hint}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
});
