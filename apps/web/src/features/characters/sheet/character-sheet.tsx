'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpCircleIcon,
  CopyIcon,
  FileDownIcon,
  GamepadIcon,
  LayoutListIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  StarIcon,
  UndoIcon,
  UnlinkIcon,
  ArchiveIcon,
  PlusIcon,
} from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CharacterCard, Portrait } from '../character-card';
import { useCharacter, useCharacterCommand, useSaveBuild } from '../use-character';
import { SheetProvider, useSheet, type SheetContextValue } from './context';
import { TabMain } from './tab-main';
import { TabCombat } from './tab-combat';
import { TabSpells } from './tab-spells';
import { TabGear } from './tab-gear';
import { TabFeatures } from './tab-features';
import { TabBio } from './tab-bio';
import { CharacterNotes } from '@/features/notes/character-notes';
import { TabLog } from './tab-log';
import { PlayMode, StickyStats } from './play-mode';

const S = ru.sheet;
const TABS = ['main', 'combat', 'spells', 'gear', 'features', 'bio', 'notes', 'log'] as const;
type Tab = (typeof TABS)[number];

/** Лист персонажа (SPEC §12.1) и игровой режим (§12.2). */
export function CharacterSheet({ characterId }: { characterId: string }) {
  const { query, character, full, content, sheet } = useCharacter(characterId, { live: true });
  const { run, isPending } = useCharacterCommand(characterId, content.data?.index);
  const { save } = useSaveBuild(characterId);
  return (
    <QueryState isLoading={query.isLoading} error={query.error}>
      {character?.access === 'summary' && (
        <div className="grid max-w-md gap-3">
          <CharacterCard c={{ ...character, status: 'ready', subtitle: `${ru.characters.owner}: ${character.ownerName}` }} href="#" />
          <p className="text-sm text-muted-foreground">{ru.characters.summaryOnly}</p>
        </div>
      )}
      {full && sheet && (
        <SheetProvider
          value={{
            characterId,
            character: full,
            sheet,
            index: content.data?.index ?? null,
            run,
            busy: isPending,
            saveBuild: save,
            canEdit: full.canEdit,
            canEditState: full.canEditState && full.build.status === 'ready',
          }}
        >
          <SheetBody />
        </SheetProvider>
      )}
    </QueryState>
  );
}

function SheetBody() {
  const { character, sheet, characterId, canEdit } = useSheet();
  const params = useSearchParams();
  const router = useRouter();
  const play = params.get('mode') === 'play';
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'main';
  const setTab = (t: string) => router.replace(`/characters/${characterId}?tab=${t}`, { scroll: false });
  const draft = character.build.status === 'draft';
  const pending = sheet.pendingChoices.length;
  const errors = sheet.issues.filter((i) => i.severity === 'error' && i.code !== 'pending_choice');

  return (
    <>
      <StickyStats />
      <SheetHeader play={play} />
      {draft && (
        <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          {S.draftBanner}
          {canEdit && (
            <Button asChild size="sm">
              <Link href={`/characters/${characterId}/build`}>{S.finishBuilding}</Link>
            </Button>
          )}
        </div>
      )}
      {!draft && pending > 0 && (
        <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm" data-testid="pending-banner">
          {S.pendingBanner(pending)}: {sheet.pendingChoices.map((c) => c.labelRu).join(', ')}
          {canEdit && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/characters/${characterId}/build?step=class`}>{ru.choices.goTo}</Link>
            </Button>
          )}
        </div>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="mb-3 grid gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {errors.map((i, n) => (
            <li key={n}>{i.messageRu}</li>
          ))}
        </ul>
      )}
      {play ? (
        <PlayMode />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-3 w-full justify-start overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {S.tabs[t]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="main">
            <TabMain />
          </TabsContent>
          <TabsContent value="combat">
            <TabCombat />
          </TabsContent>
          <TabsContent value="spells">
            <TabSpells />
          </TabsContent>
          <TabsContent value="gear">
            <TabGear />
          </TabsContent>
          <TabsContent value="features">
            <TabFeatures />
          </TabsContent>
          <TabsContent value="bio">
            <TabBio />
          </TabsContent>
          <TabsContent value="notes">
            <CharacterNotes characterId={characterId} campaignId={character.campaign?.id ?? null} />
          </TabsContent>
          <TabsContent value="log">
            <TabLog />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function XpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run } = useSheet();
  const [amount, setAmount] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{S.addXp}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.floor(Number(amount));
            if (n > 0) run({ type: 'gain_xp', amount: n });
            setAmount('');
            onClose();
          }}
        >
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={S.grantXp} autoFocus />
          <DialogFooter>
            <Button type="submit">{ru.common.add}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SheetHeader({ play }: { play: boolean }) {
  const { character, sheet, characterId, run, canEdit, canEditState } = useSheet();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const [xpOpen, setXpOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const key = trpc.characters.get.queryKey({ characterId });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const undo = useMutation(trpc.characters.undoLevel.mutationOptions({ onSuccess: () => (toast.success(S.undone), refresh()) }));
  const duplicate = useMutation(
    trpc.characters.duplicate.mutationOptions({
      onSuccess: ({ id }) => {
        toast.success(ru.characters.duplicated);
        router.push(`/characters/${id}`);
      },
    }),
  );
  const archive = useMutation(trpc.characters.archive.mutationOptions({ onSuccess: () => router.push('/characters') }));
  const detach = useMutation(trpc.characters.detach.mutationOptions({ onSuccess: () => (toast.success(ru.characters.detached), refresh()) }));
  const xpMode = character.rules.leveling === 'xp';
  const canLevel = canEdit && character.build.status === 'ready' && sheet.level.total < 20 && (!xpMode || sheet.xp.canLevelUp);
  const canXp = canEditState && (character.canGrant || (!character.campaign && character.isOwner));
  const classLine = sheet.identity.classLabelRu;

  return (
    <div className="mb-3 flex flex-wrap items-start gap-3" data-testid="sheet-header">
      <Portrait url={character.portraitUrl} name={sheet.identity.name || '?'} className="hidden size-16 sm:flex" />
      <div className="grid min-w-0 flex-1 gap-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight" data-testid="sheet-name">
          {sheet.identity.name || character.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[sheet.identity.raceLabelRu, classLine, sheet.identity.backgroundLabelRu].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {character.campaign && (
            <Link href={`/campaigns/${character.campaign.id}`} className="text-primary hover:underline">
              {character.campaign.name}
            </Link>
          )}
          {xpMode && (
            <Badge variant="outline" data-testid="xp">
              {S.xp}: {sheet.xp.nextLevelAt !== null ? S.xpNext(sheet.xp.current, sheet.xp.nextLevelAt) : S.xpMax}
            </Badge>
          )}
          <button
            type="button"
            disabled={!canEditState}
            onClick={() => run({ type: 'set_inspiration', value: !sheet.status.inspiration })}
            className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5', sheet.status.inspiration && 'border-primary bg-primary/15 text-primary')}
            aria-pressed={sheet.status.inspiration}
          >
            <StarIcon className="size-3" />
            {S.inspiration}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canLevel && (
          <Button asChild data-testid="btn-level-up">
            <Link href={`/characters/${characterId}/level-up`}>
              <ArrowUpCircleIcon />
              {S.levelUp}
            </Link>
          </Button>
        )}
        <Button asChild variant={play ? 'default' : 'outline'}>
          <Link href={play ? `/characters/${characterId}` : `/characters/${characterId}?mode=play`} data-testid="btn-play-mode">
            {play ? <LayoutListIcon /> : <GamepadIcon />}
            {play ? S.sheetMode : S.playMode}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={ru.common.more}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && (
              <DropdownMenuItem asChild>
                <Link href={`/characters/${characterId}/build`}>
                  <PencilIcon />
                  {S.editBuild}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <a href={`/characters/${characterId}/pdf`} target="_blank" rel="noopener">
                <FileDownIcon />
                {S.pdf}
              </a>
            </DropdownMenuItem>
            {canXp && (
              <DropdownMenuItem onSelect={() => setXpOpen(true)}>
                <PlusIcon />
                {S.addXp}
              </DropdownMenuItem>
            )}
            {canEdit && character.build.levels.length > 1 && (
              <DropdownMenuItem
                onSelect={() => {
                  if (window.confirm(S.undoConfirm)) undo.mutate({ characterId, expectedVersion: character.version });
                }}
              >
                <UndoIcon />
                {S.undoLevel}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {character.isOwner && (
              <DropdownMenuItem onSelect={() => duplicate.mutate({ characterId })}>
                <CopyIcon />
                {ru.characters.duplicate}
              </DropdownMenuItem>
            )}
            {character.isOwner && !character.campaign && (
              <DropdownMenuItem onSelect={() => setAttachOpen(true)}>
                <LinkIcon />
                {ru.characters.attach}
              </DropdownMenuItem>
            )}
            {character.canDetach && (
              <DropdownMenuItem
                onSelect={() => {
                  if (window.confirm(ru.characters.detachConfirm)) detach.mutate({ characterId });
                }}
              >
                <UnlinkIcon />
                {ru.characters.detach}
              </DropdownMenuItem>
            )}
            {character.canArchive && (
              <DropdownMenuItem
                onSelect={() => {
                  if (window.confirm(ru.characters.archiveConfirm)) archive.mutate({ characterId, archived: !character.archivedAt });
                }}
              >
                <ArchiveIcon />
                {character.archivedAt ? ru.characters.restore : ru.characters.archive}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <XpDialog open={xpOpen} onClose={() => setXpOpen(false)} />
      <AttachDialog open={attachOpen} onClose={() => setAttachOpen(false)} />
    </div>
  );
}

function AttachDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { characterId } = useSheet();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const targets = useQuery({ ...trpc.characters.attachTargets.queryOptions(), enabled: open });
  const attach = useMutation(
    trpc.characters.attach.mutationOptions({
      onSuccess: () => {
        toast.success(ru.characters.attached);
        onClose();
        void qc.invalidateQueries({ queryKey: trpc.characters.get.queryKey({ characterId }) });
      },
    }),
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{ru.characters.attach}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {targets.data?.length === 0 && <p className="text-sm text-muted-foreground">{ru.characters.noAttachTargets}</p>}
          {targets.data?.map((c) => (
            <Button key={c.id} variant="outline" onClick={() => attach.mutate({ characterId, campaignId: c.id })}>
              {c.name}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { SheetContextValue };
