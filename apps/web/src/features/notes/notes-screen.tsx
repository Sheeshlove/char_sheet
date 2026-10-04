'use client';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DownloadIcon, MoreHorizontalIcon, PlusIcon, UploadIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { errorMessage, ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CampaignNav, type CampaignSection } from '../campaigns/campaign-nav';
import { NotesList } from './notes-list';
import { notesBase, NotesSidebar } from './notes-sidebar';
import { NoteView } from './note-view';
import { useNotesFilter } from './use-notes-filter';

const N = ru.notes;

/** Шапка разделов заметок кампании (или личных заметок). */
export function NotesHeader({
  campaignId,
  section,
  actions,
}: {
  campaignId: string | null;
  section: CampaignSection;
  actions?: React.ReactNode;
}) {
  const trpc = useTRPC();
  const campaign = useQuery({ ...trpc.campaigns.get.queryOptions({ campaignId: campaignId ?? '' }), enabled: !!campaignId });
  const isGm = campaign.data?.role === 'gm' || campaign.data?.role === 'co_gm';
  if (!campaignId) return <PageHeader title={N.personalTitle} description={N.personalHint} actions={actions} />;
  return (
    <>
      <PageHeader title={campaign.data?.name ?? '…'} actions={actions} />
      <CampaignNav campaignId={campaignId} isGm={isGm} active={section} />
    </>
  );
}

/** Экран заметок (§11.3): слева — навигация, в центре — список, справа — открытая заметка. */
export function NotesScreen({ campaignId, noteId }: { campaignId: string | null; noteId: string | null }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const { view, setView, query } = useNotesFilter();
  const base = notesBase(campaignId);
  const importInput = useRef<HTMLInputElement>(null);
  const create = useMutation(
    trpc.notes.create.mutationOptions({
      onSuccess: ({ id }) => {
        void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
        void qc.invalidateQueries({ queryKey: trpc.notes.counts.queryKey() });
        router.push(`${base}/${id}${query ? `?${query}` : ''}`);
      },
    }),
  );
  const importFile = async (file: File) => {
    const form = new FormData();
    form.set('file', file);
    if (campaignId) form.set('campaignId', campaignId);
    const res = await fetch('/api/notes/import', { method: 'POST', body: form, credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as { imported?: number; error?: string };
    if (!res.ok) {
      toast.error(body.error ? errorMessage(body.error) : N.importFailed);
      return;
    }
    toast.success(N.imported(body.imported ?? 0));
    void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
    void qc.invalidateQueries({ queryKey: trpc.notes.counts.queryKey() });
    void qc.invalidateQueries({ queryKey: trpc.tags.list.queryKey() });
  };
  const newType = view.filter.types.length === 1 ? view.filter.types[0]! : 'general';

  return (
    <>
      <NotesHeader
        campaignId={campaignId}
        section="notes"
        actions={
          <>
            <Button onClick={() => create.mutate({ campaignId, type: newType, title: '' })} disabled={create.isPending} data-testid="note-new">
              <PlusIcon />
              {N.newNote}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={ru.common.more} data-testid="notes-more">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/notes/export?${campaignId ? `campaign=${campaignId}` : 'personal=1'}`} download data-testid="notes-export">
                    <DownloadIcon />
                    {N.exportZip}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => importInput.current?.click()}>
                  <UploadIcon />
                  {N.import}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={importInput}
              type="file"
              accept=".md,.markdown,.zip,text/markdown,application/zip"
              className="sr-only"
              aria-label={N.import}
              data-testid="notes-import-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[200px_300px_minmax(0,1fr)]">
        <aside className={cn(noteId && 'hidden lg:block')}>
          <NotesSidebar campaignId={campaignId} view={view} setView={setView} />
        </aside>
        <div className={cn(noteId && 'hidden lg:block')}>
          <NotesList campaignId={campaignId} view={view} setView={setView} selectedId={noteId} query={query} />
        </div>
        <div className={cn('min-w-0', !noteId && 'hidden lg:block')}>
          {noteId ? (
            <NoteView key={noteId} noteId={noteId} campaignId={campaignId} backHref={`${base}${query ? `?${query}` : ''}`} />
          ) : (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{N.selectHint}</p>
          )}
        </div>
      </div>
    </>
  );
}
