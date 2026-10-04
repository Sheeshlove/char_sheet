import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/** Что выбрасывается из страницы до конвертации (SPEC §7.5): картинки, реклама, комментарии, навигация. */
const DROP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'img',
  'picture',
  'video',
  'audio',
  'svg',
  'canvas',
  'form',
  'button',
  'input',
  'select',
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[class*="adsbygoogle"]',
  '[class*="advert"]',
  '[id*="advert"]',
  '[class*="banner"]',
  '[class*="comments"]',
  '[id*="comments"]',
  '[class*="breadcrumb"]',
  '[class*="share"]',
];

export function loadHtml(html: string) {
  return cheerio.load(html);
}

/** Удаляет служебные узлы и HTML-комментарии. */
export function cleanDom($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>) {
  root.find(DROP_SELECTORS.join(',')).remove();
  root
    .find('*')
    .addBack()
    .contents()
    .filter((_, n) => n.type === 'comment')
    .remove();
  return root;
}

let service: TurndownService | null = null;

function turndown(): TurndownService {
  if (!service) {
    service = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      strongDelimiter: '**',
    });
    service.use(gfm);
    // Ссылки внутри dnd.su оставляем текстом: у нас свои маршруты справочника.
    service.addRule('plainLinks', {
      filter: 'a',
      replacement: (content) => content,
    });
  }
  return service;
}

/** HTML-фрагмент → Markdown (таблицы — GFM). */
export function htmlToMarkdown(html: string): string {
  return turndown()
    .turndown(html)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Текст узла без лишних пробелов. */
export function textOf($el: cheerio.Cheerio<AnyNode>): string {
  return $el.text().replace(/\s+/g, ' ').trim();
}
