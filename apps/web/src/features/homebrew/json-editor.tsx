'use client';
import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { basicSetup, EditorView } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';

/** Режим «JSON» редактора homebrew (SPEC §14): CodeMirror 6 с подсветкой JSON. */
export function JsonEditor({ value, onChange, label }: { value: string; onChange: (text: string) => void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    change.current = onChange;
  });
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          json(),
          ...(resolvedTheme === 'dark' ? [oneDark] : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.theme({ '&': { maxHeight: '70vh', fontSize: '12px' }, '.cm-scroller': { overflow: 'auto' } }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Редактор создаётся заново только при смене темы; текст дальше меняется в нём самом.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme, label]);
  return <div ref={host} className="overflow-hidden rounded-md border" data-testid="json-editor" />;
}
