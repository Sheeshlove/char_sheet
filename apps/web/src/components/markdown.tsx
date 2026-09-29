import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';

/**
 * Markdown контента и заметок (SPEC §12.4): react-markdown + GFM + rehype-sanitize.
 * Сырой HTML никогда не вставляется.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose-ps', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
