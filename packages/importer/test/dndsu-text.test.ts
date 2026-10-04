import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../src/dndsu/parse/html';
import {
  findSourceBook,
  labeledFields,
  leadBlocks,
  levelFromText,
  mdTables,
  parseTitle,
  splitBlocks,
  splitBracketName,
} from '../src/dndsu/parse/text';
import { parseRecord } from '../src/dndsu/parse/record';
import { externalKey, listUrl, parseEntityUrl } from '../src/dndsu/sections';
import { parseRobots } from '../src/dndsu/robots';

describe('URL dnd.su', () => {
  it('разбирает страницы сущностей и homebrew', () => {
    expect(parseEntityUrl('https://dnd.su/class/87-barbarian/')).toEqual({
      url: 'https://dnd.su/class/87-barbarian/',
      section: 'classes',
      homebrew: false,
      externalId: 87,
      slug: 'barbarian',
    });
    expect(parseEntityUrl('/homebrew/class/853-alternate-barbarian/')).toMatchObject({
      section: 'classes',
      homebrew: true,
      externalId: 853,
      slug: 'alternate-barbarian',
    });
    expect(parseEntityUrl('/spells/205-fireball')?.url).toBe('https://dnd.su/spells/205-fireball/');
    expect(parseEntityUrl('https://dnd.su/race/78-dwarf/?x=1#top')?.slug).toBe('dwarf');
  });

  it('отбрасывает посторонние ссылки', () => {
    expect(parseEntityUrl('https://dnd.su/bestiary/1-aboleth/')).toBeNull();
    expect(parseEntityUrl('https://example.com/spells/205-fireball/')).toBeNull();
    expect(parseEntityUrl('/spells/')).toBeNull();
    expect(parseEntityUrl('/spells/fireball/')).toBeNull();
    expect(parseEntityUrl('mailto:x@y')).toBeNull();
  });

  it('внешний ключ и URL списка', () => {
    expect(externalKey({ section: 'spells', homebrew: false, externalId: 205 })).toBe('spells/205');
    expect(externalKey({ section: 'classes', homebrew: true, externalId: 853 })).toBe('homebrew/class/853');
    expect(listUrl('races', false)).toBe('https://dnd.su/race/');
    expect(listUrl('items', true)).toBe('https://dnd.su/homebrew/items/');
  });
});

describe('robots.txt', () => {
  const txt = `
User-agent: *
Disallow: /search
Disallow: /*?print
Allow: /search/help
Crawl-delay: 2

User-agent: BadBot
Disallow: /
`;
  it('применяет группу * и самое длинное правило', () => {
    const r = parseRobots(txt, 'PartySheetImporter/1.0');
    expect(r.isAllowed('/spells/205-fireball/')).toBe(true);
    expect(r.isAllowed('/search?q=1')).toBe(false);
    expect(r.isAllowed('/search/help')).toBe(true);
    expect(r.isAllowed('/class/87-barbarian/?print')).toBe(false);
    expect(r.crawlDelayMs).toBe(2000);
  });
  it('выбирает группу своего агента', () => {
    expect(parseRobots(txt, 'BadBot/2').isAllowed('/spells/')).toBe(false);
    expect(parseRobots('', 'x').isAllowed('/anything')).toBe(true);
  });
});

describe('текст страниц', () => {
  it('русское и английское название', () => {
    expect(splitBracketName('Огненный шар [Fireball]')).toEqual({ nameRu: 'Огненный шар', nameEn: 'Fireball' });
    expect(splitBracketName('  Варвар  ')).toEqual({ nameRu: 'Варвар' });
  });

  it('заголовок страницы и источник', () => {
    expect(parseTitle("Варвар / Классы D&D 5 / Player's Handbook")).toEqual({
      name: 'Варвар',
      sectionTitle: 'Классы D&D 5',
      source: "Player's Handbook",
    });
    expect(findSourceBook('Текст\n\nИсточник: «Player\'s handbook»')).toBe("Player's handbook");
    expect(findSourceBook('без источника')).toBeUndefined();
  });

  it('поля «Метка: значение»', () => {
    const md = [
      '**Время накладывания:** 1 действие',
      '- **Дистанция:** 150 футов',
      'Компоненты: В, С, М (крошечный шарик)',
      '**Длительность**: Мгновенная',
      '| Уровень | Умения |',
    ].join('\n');
    expect(labeledFields(md)).toEqual({
      'время накладывания': '1 действие',
      дистанция: '150 футов',
      компоненты: 'В, С, М (крошечный шарик)',
      длительность: 'Мгновенная',
    });
  });

  it('уровень умения из текста', () => {
    expect(levelFromText('Начиная с 3-го уровня вы можете')).toBe(3);
    expect(levelFromText('На 11 уровне ваша ярость')).toBe(11);
    expect(levelFromText('Безрассудная атака (2 уровень)')).toBe(2);
    expect(levelFromText('просто текст')).toBeUndefined();
    expect(levelFromText('На 25 уровне')).toBeUndefined();
  });

  it('блоки по заголовкам и абзацы с полужирным началом', () => {
    const md = '# Варвар\n\nВводный текст\n\n## Ярость [Rage]\n\nВ бою вы сражаетесь…\n\n### Защита без доспехов [Unarmored Defense]\n\nНа 1 уровне…';
    const blocks = splitBlocks(md);
    expect(blocks.map((b) => [b.headingRu, b.headingEn, b.depth])).toEqual([
      ['', undefined, 0],
      ['Ярость', 'Rage', 2],
      ['Защита без доспехов', 'Unarmored Defense', 3],
    ]);
    expect(blocks[2]!.level).toBe(1);
    const lead = leadBlocks('**Увеличение характеристик.** Значение вашего Телосложения увеличивается на 2.\n\n**Возраст.** Дварфы взрослеют…\n\nПродолжение абзаца.');
    expect(lead.map((b) => b.headingRu)).toEqual(['Увеличение характеристик', 'Возраст']);
    expect(lead[1]!.md).toContain('Продолжение абзаца.');
  });

  it('GFM-таблицы', () => {
    const md = '| Уровень | Умения |\n| --- | --- |\n| 1 | Ярость, Защита без доспехов |\n| 2 | Безрассудная атака |\n\nТекст';
    expect(mdTables(md)).toEqual([
      { headers: ['Уровень', 'Умения'], rows: [['1', 'Ярость, Защита без доспехов'], ['2', 'Безрассудная атака']] },
    ]);
  });

  it('HTML → Markdown: таблицы, без картинок и скриптов', () => {
    const md = htmlToMarkdown(
      '<p><strong>Дистанция:</strong> 150 футов</p><table><thead><tr><th>Уровень</th><th>Умения</th></tr></thead><tbody><tr><td>1</td><td>Ярость</td></tr></tbody></table>',
    );
    expect(md).toContain('**Дистанция:** 150 футов');
    expect(md).toContain('| Уровень | Умения |');
    expect(md).toContain('| 1 | Ярость |');
  });

  it('parseRecord: общие поля и очистка страницы', () => {
    const html = `<html><head><title>Огненный шар / Заклинания D&D 5 / Player's Handbook</title></head>
      <body><nav><a href="/class/87-barbarian/">Варвар</a></nav>
      <article><h2>Огненный шар [Fireball]</h2>
        <img src="x.png"><script>alert(1)</script><!-- комментарий -->
        <p>3 уровень, воплощение</p>
        <p><strong>Время накладывания:</strong> 1 действие</p>
        <p><strong>Дистанция:</strong> 150 футов</p>
        <p><strong>Компоненты:</strong> В, С, М (крошечный шарик из гуано летучей мыши и серы)</p>
        <p><strong>Длительность:</strong> Мгновенная</p>
        <p><strong>Классы:</strong> волшебник, чародей</p>
        <p>Яркий луч вспыхивает… получает урон огнём 8к6 при провале спасброска Ловкости.</p>
        <p><strong>На больших уровнях.</strong> Урон увеличивается на 1к6 за каждый уровень ячейки выше третьего.</p>
      </article></body></html>`;
    const rec = parseRecord(html, { url: 'https://dnd.su/spells/205-fireball/', section: 'spells', homebrew: false, externalId: 205 });
    expect(rec.nameRu).toBe('Огненный шар');
    expect(rec.nameEn).toBe('Fireball');
    expect(rec.sourceBook).toBe("Player's Handbook");
    expect(rec.bodyMd).not.toMatch(/alert|x\.png|комментарий|Варвар/);
    expect(rec.fields).toMatchObject({
      levelSchool: '3 уровень, воплощение',
      castingTime: '1 действие',
      range: '150 футов',
      duration: 'Мгновенная',
      classes: 'волшебник, чародей',
      higherLevels: 'Урон увеличивается на 1к6 за каждый уровень ячейки выше третьего.',
    });
  });
});
