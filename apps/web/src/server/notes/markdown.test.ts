import { describe, expect, it } from 'vitest';
import { docLinks, docText, docToMarkdown, fieldLinks, noteLinks } from '@/lib/notes/doc';
import { noteBodySchema, parseNoteFields, readNoteFields, type DocNode } from '@/lib/notes/schema';
import { markdownToDoc, parseMarkdownNote, splitFrontmatter } from './markdown';

const NPC = '11111111-1111-4111-8111-111111111111';
const HERO = '22222222-2222-4222-8222-222222222222';

const doc: DocNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Сессия 3' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Встретили ' },
        { type: 'wikiLink', attrs: { noteId: NPC, label: 'Гундрен' } },
        { type: 'text', text: ' и ' },
        { type: 'mention', attrs: { targetType: 'character', targetId: HERO, label: 'Торин' } },
        { type: 'text', text: ' — ' },
        { type: 'text', text: 'дракон', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' рядом.' },
      ],
    },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Найти рудник' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Спасти Сильдар' }] }] },
      ],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'Сайт', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
  ],
};

describe('документ заметки', () => {
  it('плоский текст включает подписи ссылок', () => {
    expect(docText(doc)).toBe('Сессия 3\nВстретили Гундрен и Торин — дракон рядом.\nНайти рудник\nСпасти Сильдар\nСайт');
  });

  it('ссылки WikiLink и Mention с контекстом блока; поля типа — отдельно', () => {
    expect(docLinks(doc)).toEqual([
      { targetType: 'note', targetId: NPC, context: 'Встретили Гундрен и Торин — дракон рядом.' },
      { targetType: 'character', targetId: HERO, context: 'Встретили Гундрен и Торин — дракон рядом.' },
    ]);
    const fields = parseNoteFields('npc', { status: 'alive', location: NPC });
    expect(fieldLinks('npc', fields)).toEqual([{ targetType: 'note', targetId: NPC, context: 'field:location' }]);
    expect(noteLinks(doc, 'npc', fields)).toHaveLength(2);
    expect(fieldLinks('session', parseNoteFields('session', { participants: [HERO] }))).toEqual([
      { targetType: 'character', targetId: HERO, context: 'field:participants' },
    ]);
  });

  it('поля по типу: значения по умолчанию, лишние ключи — ошибка при записи и отбрасываются при чтении', () => {
    expect(parseNoteFields('quest', {})).toEqual({ status: 'active', priority: 2 });
    expect(() => parseNoteFields('quest', { hack: 1 })).toThrow();
    expect(readNoteFields('quest', { status: 'failed', hack: 1 })).toEqual({ status: 'failed', priority: 2 });
  });

  it('тело — только документ разумного размера', () => {
    expect(noteBodySchema.safeParse(doc).success).toBe(true);
    expect(noteBodySchema.safeParse({ type: 'paragraph' }).success).toBe(false);
    const huge = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(200_000) }] }] };
    expect(noteBodySchema.safeParse({ ...huge, content: Array.from({ length: 6 }, () => huge.content[0]) }).success).toBe(false);
  });
});

describe('Markdown', () => {
  it('экспорт: WikiLink → [[актуальный заголовок]], опасные ссылки отброшены', () => {
    const md = docToMarkdown(doc, (id) => (id === NPC ? 'Гундрен Искатель Скал' : undefined));
    expect(md).toContain('## Сессия 3');
    expect(md).toContain('[[Гундрен Искатель Скал|Гундрен]]');
    expect(md).toContain('@Торин');
    expect(md).toContain('**дракон**');
    expect(md).toContain('- [x] Найти рудник');
    expect(md).toContain('- [ ] Спасти Сильдар');
    expect(md).not.toContain('javascript');
  });

  it('импорт: frontmatter, [[ссылки]], задачи, таблица, выделение', () => {
    const src = [
      '---',
      'type: npc',
      'tags: [союзник, "Фанделвер"]',
      '---',
      '# Гундрен',
      '',
      'Брат [[Нандро|Нандро Искатель]] знает ==тайну== и `код`.',
      '',
      '- [x] спасён',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '[плохая](javascript:alert(1)) [хорошая](https://dnd.su)',
    ].join('\n');
    const { frontmatter, doc: d } = parseMarkdownNote(src);
    expect(frontmatter).toEqual({ type: 'npc', tags: ['союзник', 'Фанделвер'] });
    expect(d.content![0]).toEqual({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Гундрен' }] });
    const p = d.content![1]!;
    expect(p.content).toContainEqual({ type: 'wikiLink', attrs: { noteId: null, label: 'Нандро Искатель', title: 'Нандро' } });
    expect(p.content).toContainEqual({ type: 'text', text: 'тайну', marks: [{ type: 'highlight' }] });
    expect(p.content).toContainEqual({ type: 'text', text: 'код', marks: [{ type: 'code' }] });
    expect(d.content![2]!.type).toBe('taskList');
    expect(d.content![2]!.content![0]!.attrs).toEqual({ checked: true });
    expect(d.content![3]!.type).toBe('table');
    const links = d.content![4]!.content!.flatMap((n) => n.marks ?? []).filter((m) => m.type === 'link');
    expect(links).toEqual([{ type: 'link', attrs: { href: 'https://dnd.su' } }]);
  });

  it('экспорт → импорт сохраняет структуру и ссылки', () => {
    const md = docToMarkdown(doc, (id) => (id === NPC ? 'Гундрен' : undefined));
    const back = markdownToDoc(md);
    expect(docText(back)).toBe(docText(doc).replace('Торин', '@Торин'));
    expect(back.content![1]!.content).toContainEqual({ type: 'wikiLink', attrs: { noteId: null, label: 'Гундрен', title: 'Гундрен' } });
    expect(back.content![2]!.type).toBe('taskList');
  });

  it('без frontmatter и с битым YAML', () => {
    expect(splitFrontmatter('Просто текст')).toEqual({ frontmatter: {}, body: 'Просто текст' });
    expect(splitFrontmatter('---\n: : [\n---\nТекст').frontmatter).toEqual({});
    expect(markdownToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});
