'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  DownloadIcon,
  HistoryIcon,
  InboxIcon,
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react';
import type { AppRouter } from '@/server/trpc/routers/_app';
import { trpcErrorText, useTRPC, useTRPCClient } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { NOTE_TYPES, NOTE_VISIBILITIES, readNoteFields, type AnyNoteFields, type DocNode, type NoteType, type NoteVisibilityValue } from '@/lib/notes/schema';
import { formatDateTime } from '@/lib/utils';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NoteEditor } from './editor/note-editor';
import { NoteRender } from './note-render';
import { NoteFields, useScopeCharacters } from './note-fields';
import { Backlinks, ShareDialog, TagsPicker, VersionsDialog } from './note-panels';
import { notesBase } from './notes-sidebar';
import { VIS_ICON } from './notes-list';
import { useNoteAutosave, type NotePatch } from './use-note-autosave';

const N = ru.notes;
const NONE = '__none';
type Note = inferRouterOutputs<AppRouter>['notes']['get'];

/** Открытая заметка (правая колонка экрана заметок). */
export function NoteView({ noteId, campaignId, backHref }: { noteId: string; campaignId: string | null; backHref?: string }) {
  const trpc = useTRPC();
  // Локальное состояние редактора берётся из свежих данных: при каждом открытии — запрос.
  const note = useQuery({ ...trpc.notes.get.queryOptions({ noteId }), refetchOnWindowFocus: false, refetchOnMount: 'always', staleTime: Infinity });
  const [reload, setReload] = useState(0);
  const onReload = useCallback(async () => {
    await note.refetch();
    setReload((r) => r + 1);
  }, [note]);
  return (
    <QueryState isLoading={note.isLoading || (!note.isFetchedAfterMount && !note.error)} error={note.error}>
      {note.data && note.isFetchedAfterMount && <NotePane key={`${noteId}:${reload}`} note={note.data} campaignId={campaignId} onReload={onReload} backHref={backHref} />}
    </QueryState>
  );
}

function NotePane({ note, campaignId, onReload, backHref }: { note: Note; campaignId: string | null; onReload: () => Promise<void>; backHref?: string }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [type, setType] = useState<NoteType>(note.type);
  const [fields, setFields] = useState<AnyNoteFields>(note.fields);
  const [visibility, setVisibility] = useState<NoteVisibilityValue>(note.visibility);
  const [sessionNo, setSessionNo] = useState<number | null>(note.sessionNo);
  const [gameDate, setGameDate] = useState(note.gameDate ?? '');
  const [realDate, setRealDate] = useState(note.realDate ?? '');
  const [characterId, setCharacterId] = useState<string | null>(note.character?.id ?? null);
  const [pinned, setPinned] = useState(note.pinned);
  const body = useRef<DocNode>(note.body);
  const [bodyForHistory, setBodyForHistory] = useState<DocNode>(note.body);
  const [labels, setLabels] = useState(() => new Map(note.links.map((l) => [l.targetId, l.label])));
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const autosave = useNoteAutosave(note.id, note.updatedAt);
  const chars = useScopeCharacters(campaignId);
  const canEdit = note.canEdit;
  const base = notesBase(campaignId);

  const markRead = useMutation(trpc.notes.markRead.mutationOptions({ meta: { silent: true } }));
  const markedRef = useRef(false);
  useEffect(() => {
    if (note.isShareRecipient && !markedRef.current) {
      markedRef.current = true;
      markRead.mutate({ noteId: note.id }, { onSuccess: () => void qc.invalidateQueries({ queryKey: trpc.notes.handouts.queryKey() }) });
    }
  }, [note.isShareRecipient, note.id, markRead, qc, trpc]);

  const change = (patch: NotePatch) => {
    if (canEdit) autosave.schedule(patch);
  };
  const full = (): NotePatch => ({
    title,
    body: body.current,
    type,
    fields,
    ...(note.isAuthor ? { visibility } : {}),
    sessionNo,
    gameDate: gameDate || null,
    realDate: realDate || null,
    characterId,
    pinned,
  });
  const onBody = useCallback(
    (doc: DocNode) => {
      body.current = doc;
      autosave.schedule({ body: doc });
    },
    [autosave],
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: trpc.notes.list.pathKey() });
    void qc.invalidateQueries({ queryKey: trpc.notes.counts.queryKey() });
  };
  const trash = useMutation(
    trpc.notes.trash.mutationOptions({
      onSuccess: () => {
        toast.success(N.trashed);
        refresh();
        router.push(base);
      },
    }),
  );
  const restoreVersion = async (versionId: string) => {
    await autosave.flush();
    try {
      const cur = await client.notes.get.query({ noteId: note.id });
      await client.notes.versions.restore.mutate({ noteId: note.id, versionId, expectedUpdatedAt: cur.updatedAt });
      toast.success(N.versionRestored);
      refresh();
      await onReload();
    } catch (e) {
      toast.error(trpcErrorText(e));
    }
  };
  const saveCopy = async () => {
    try {
      const copy = await client.notes.create.mutate({
        campaignId,
        title: `${title || N.untitled}${N.copySuffix}`,
        type,
        body: body.current,
        fields,
        visibility,
        sessionNo,
        gameDate: gameDate || null,
        realDate: realDate || null,
      });
      await autosave.resolve('drop');
      toast.success(N.copied);
      refresh();
      router.push(`${base}/${copy.id}`);
    } catch (e) {
      toast.error(trpcErrorText(e));
    }
  };

  const Vis = VIS_ICON[visibility];
  const statusText =
    autosave.status === 'saving' ? N.saving : autosave.status === 'saved' ? N.saved : autosave.status === 'dirty' ? N.unsaved : '';
  const history = useMemo(() => ({ title, body: bodyForHistory }), [title, bodyForHistory]);

  return (
    <article className="grid min-w-0 gap-4" data-testid="note-view">
      <div className="flex items-start gap-2">
        {backHref && (
          <Button asChild size="icon" variant="ghost" className="lg:hidden" aria-label={ru.common.back}>
            <Link href={backHref}>
              <ArrowLeftIcon />
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          {canEdit ? (
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                change({ title: e.target.value });
              }}
              placeholder={N.titlePlaceholder}
              aria-label={N.titlePlaceholder}
              maxLength={200}
              className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground"
              data-testid="note-title"
            />
          ) : (
            <h2 className="text-2xl font-semibold" data-testid="note-title">
              {title || N.untitled}
            </h2>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{N.types[type]}</Badge>
            <span className="inline-flex items-center gap-1">
              <Vis className="size-3" />
              {N.visibilities[visibility]}
            </span>
            {note.isHandout && (
              <span className="inline-flex items-center gap-1">
                <InboxIcon className="size-3" />
                {N.handout}
              </span>
            )}
            <span>
              {N.author}: {note.authorName}
            </span>
            <span>
              {N.updated}: {formatDateTime(note.updatedAt)}
            </span>
            {!canEdit && <Badge variant="secondary">{N.readOnly}</Badge>}
            <span aria-live="polite" data-testid="save-status">
              {statusText}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={ru.common.actions} data-testid="note-menu">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEdit && (
              <DropdownMenuItem
                onSelect={() => {
                  setPinned(!pinned);
                  autosave.schedule({ pinned: !pinned });
                  void autosave.flush();
                }}
              >
                {pinned ? <PinOffIcon /> : <PinIcon />}
                {pinned ? N.unpin : N.pin}
              </DropdownMenuItem>
            )}
            {note.canShare && campaignId && (
              <DropdownMenuItem onSelect={() => setShareOpen(true)} data-testid="note-share">
                <SendIcon />
                {N.share}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                setBodyForHistory(body.current);
                setVersionsOpen(true);
              }}
            >
              <HistoryIcon />
              {N.versions}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/api/notes/export?note=${note.id}`} download>
                <DownloadIcon />
                {N.exportMd}
              </a>
            </DropdownMenuItem>
            {note.canTrash && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => trash.mutate({ noteId: note.id })} data-testid="note-trash">
                  <Trash2Icon />
                  {N.toTrash}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">{N.type}</Label>
          <Select
            value={type}
            disabled={!canEdit}
            onValueChange={(v) => {
              const t = v as NoteType;
              const f = readNoteFields(t, {});
              setType(t);
              setFields(f);
              change({ type: t, fields: f });
            }}
          >
            <SelectTrigger size="sm" aria-label={N.type} data-testid="note-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {N.types[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {campaignId && (
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{N.visibility}</Label>
            <Select
              value={visibility}
              disabled={!note.isAuthor}
              onValueChange={(v) => {
                setVisibility(v as NoteVisibilityValue);
                change({ visibility: v as NoteVisibilityValue });
              }}
            >
              <SelectTrigger size="sm" aria-label={N.visibility} title={N.visibilityHint[visibility]} data-testid="note-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_VISIBILITIES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {N.visibilities[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1">
          <Label htmlFor="note-session" className="text-xs text-muted-foreground">
            {N.sessionNo}
          </Label>
          <Input
            id="note-session"
            type="number"
            min={0}
            className="h-8"
            disabled={!canEdit}
            value={sessionNo ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value)));
              setSessionNo(v);
              change({ sessionNo: v });
            }}
          />
        </div>
        {(type === 'session' || gameDate || realDate) && (
          <>
            <div className="grid gap-1">
              <Label htmlFor="note-game-date" className="text-xs text-muted-foreground">
                {N.gameDate}
              </Label>
              <Input
                id="note-game-date"
                className="h-8"
                maxLength={100}
                disabled={!canEdit}
                value={gameDate}
                onChange={(e) => {
                  setGameDate(e.target.value);
                  change({ gameDate: e.target.value || null });
                }}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="note-real-date" className="text-xs text-muted-foreground">
                {N.realDate}
              </Label>
              <Input
                id="note-real-date"
                type="date"
                className="h-8"
                disabled={!canEdit}
                value={realDate}
                onChange={(e) => {
                  setRealDate(e.target.value);
                  change({ realDate: e.target.value || null });
                }}
              />
            </div>
          </>
        )}
        {chars.length > 0 && (
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{N.character}</Label>
            <Select
              value={characterId ?? NONE}
              disabled={!canEdit}
              onValueChange={(v) => {
                const id = v === NONE ? null : v;
                setCharacterId(id);
                change({ characterId: id });
              }}
            >
              <SelectTrigger size="sm" aria-label={N.character}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{N.noCharacter}</SelectItem>
                {chars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          <TagsPicker noteId={note.id} campaignId={campaignId} selected={note.tags} disabled={!canEdit} />
        </div>
      </div>

      <NoteFields
        noteId={note.id}
        campaignId={campaignId}
        type={type}
        fields={fields}
        refLabels={labels}
        disabled={!canEdit}
        onChange={(f, label) => {
          setFields(f);
          if (label) setLabels((m) => new Map(m).set(label.id, label.label));
          change({ fields: f });
        }}
      />

      {canEdit ? (
        <NoteEditor noteId={note.id} campaignId={campaignId} visibility={visibility} content={note.body} editable onChange={onBody} />
      ) : (
        <NoteRender doc={note.body} campaignId={campaignId} className="rounded-md border px-3 py-2" />
      )}

      <Backlinks noteId={note.id} campaignId={campaignId} />

      <VersionsDialog
        noteId={note.id}
        campaignId={campaignId}
        current={history}
        canEdit={canEdit}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        onRestore={(id) => void restoreVersion(id)}
      />
      {note.canShare && campaignId && (
        <ShareDialog
          noteId={note.id}
          campaignId={campaignId}
          authorId={note.authorId}
          shares={note.shares}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}
      <Dialog open={autosave.conflict !== null}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} data-testid="note-conflict">
          <DialogHeader>
            <DialogTitle>{N.conflictTitle}</DialogTitle>
            <DialogDescription>{N.conflictText}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => void autosave.resolve('mine', full())}>{N.keepMine}</Button>
            <Button
              variant="outline"
              onClick={() =>
                void autosave.resolve('drop').then(async () => {
                  await onReload();
                })
              }
            >
              {N.takeTheirs}
            </Button>
            <Button variant="outline" onClick={() => void saveCopy()}>
              {N.saveCopy}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
