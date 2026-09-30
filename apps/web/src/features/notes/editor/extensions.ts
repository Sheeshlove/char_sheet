import { mergeAttributes, Node, type Editor, type Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from './suggestion-list';

/**
 * Собственные узлы редактора (SPEC §11.1): WikiLink `{ noteId, label }` по вводу `[[`
 * и Mention `{ targetType, targetId, label }` по вводу `@`.
 */

export type LinkTarget = { targetType: 'note' | 'character' | 'content'; targetId: string; label: string };

type Provider = {
  items: (query: string) => Promise<SuggestionItem[]>;
  /** Выбор пункта → атрибуты узла (может создать заметку). */
  resolve: (item: SuggestionItem, query: string) => Promise<Record<string, unknown> | null>;
  empty: string;
};

function renderSuggestion(empty: string) {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, React.ComponentProps<typeof SuggestionList>> | null = null;
    let unmount: (() => void) | null = null;
    return {
      onStart: (props: SuggestionProps<SuggestionItem, SuggestionItem>) => {
        renderer = new ReactRenderer(SuggestionList, {
          editor: props.editor,
          props: { items: props.items, loading: props.loading, empty, command: props.command },
          className: 'z-50',
        });
        unmount = props.mount(renderer.element);
      },
      onUpdate: (props: SuggestionProps<SuggestionItem, SuggestionItem>) => {
        renderer?.updateProps({ items: props.items, loading: props.loading, empty, command: props.command });
      },
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'Escape') return false;
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit: () => {
        unmount?.();
        renderer?.destroy();
        renderer = null;
        unmount = null;
      },
    };
  };
}

function suggestionFor(
  editor: Editor,
  key: PluginKey,
  char: string,
  nodeName: string,
  provider: () => Provider,
): SuggestionOptions<SuggestionItem, SuggestionItem> {
  let lastQuery = '';
  return {
    editor,
    pluginKey: key,
    char,
    allowSpaces: true,
    allowedPrefixes: null,
    debounce: 150,
    items: async ({ query }) => {
      lastQuery = query.replace(/\]+$/, '');
      try {
        return await provider().items(lastQuery);
      } catch {
        return [];
      }
    },
    command: ({ editor: ed, range, props }: { editor: Editor; range: Range; props: SuggestionItem }) => {
      void provider()
        .resolve(props, lastQuery)
        .then((attrs) => {
          if (!attrs) return;
          ed.chain()
            .focus()
            .insertContentAt(range, [
              { type: nodeName, attrs },
              { type: 'text', text: ' ' },
            ])
            .run();
        });
    },
    allow: ({ state, range }) => {
      const $from = state.doc.resolve(range.from);
      const type = state.schema.nodes[nodeName];
      return !!type && !!$from.parent.type.contentMatch.matchType(type);
    },
    render: renderSuggestion(provider().empty),
  };
}

export type NodeOptions = { provider: () => Provider };

const WIKI_KEY = new PluginKey('wikiLinkSuggestion');
const MENTION_KEY = new PluginKey('mentionSuggestion');

export const WikiLink = Node.create<NodeOptions>({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return { provider: () => ({ items: async () => [], resolve: async () => null, empty: '' }) };
  },
  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-note-id'),
        renderHTML: (a) => (a.noteId ? { 'data-note-id': a.noteId } : {}),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') ?? el.textContent ?? '',
        renderHTML: (a) => ({ 'data-label': a.label }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'wiki-link', class: 'note-link' }, HTMLAttributes), String(node.attrs.label || '?')];
  },
  renderText({ node }) {
    return `[[${String(node.attrs.label ?? '')}]]`;
  },
  addProseMirrorPlugins() {
    return [Suggestion(suggestionFor(this.editor, WIKI_KEY, '[[', this.name, this.options.provider))];
  },
});

export const NoteMention = Node.create<NodeOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return { provider: () => ({ items: async () => [], resolve: async () => null, empty: '' }) };
  },
  addAttributes() {
    return {
      targetType: {
        default: 'note',
        parseHTML: (el) => el.getAttribute('data-target-type'),
        renderHTML: (a) => ({ 'data-target-type': a.targetType }),
      },
      targetId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-target-id'),
        renderHTML: (a) => (a.targetId ? { 'data-target-id': a.targetId } : {}),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') ?? el.textContent ?? '',
        renderHTML: (a) => ({ 'data-label': a.label }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'mention', class: 'note-mention' }, HTMLAttributes), `@${String(node.attrs.label ?? '')}`];
  },
  renderText({ node }) {
    return `@${String(node.attrs.label ?? '')}`;
  },
  addProseMirrorPlugins() {
    return [Suggestion(suggestionFor(this.editor, MENTION_KEY, '@', this.name, this.options.provider))];
  },
});

/** Адрес цели ссылки в приложении. */
export function linkHref(target: { targetType: string; targetId: string }, campaignId: string | null): string | null {
  switch (target.targetType) {
    case 'note':
      return campaignId ? `/campaigns/${campaignId}/notes/${target.targetId}` : `/notes/${target.targetId}`;
    case 'character':
      return `/characters/${target.targetId}`;
    case 'content': {
      const [pack, kind, ...slug] = target.targetId.split('/');
      return pack && kind && slug.length ? `/library/${kind}/${pack}/${slug.join('/')}` : null;
    }
    default:
      return null;
  }
}
