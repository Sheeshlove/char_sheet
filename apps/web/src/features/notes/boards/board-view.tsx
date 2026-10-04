'use client';
import '@xyflow/react/dist/style.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useResolvedTheme } from '@/lib/theme';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import { toast } from 'sonner';
import { ArrowLeftIcon, StickyNoteIcon, Trash2Icon } from 'lucide-react';
import { trpcErrorText, useTRPC, useTRPCClient } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import type { NoteType } from '@/lib/notes/schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueryState } from '@/components/query-state';
import { NotesHeader } from '../notes-screen';
import { TYPE_COLOR } from '../notes-graph';

const N = ru.notes;
const B = N.boards;
/** Задержка сохранения позиций после перетаскивания. */
const POSITION_DEBOUNCE_MS = 600;

type NoteNodeData = { noteId: string | null; title: string; type: NoteType | null; campaignId: string };
type BoardNode = Node<NoteNodeData>;

function NoteNode({ data, selected }: NodeProps<BoardNode>) {
  const isNote = !!data.noteId;
  return (
    <div
      className={cn(
        'max-w-56 rounded-md border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm',
        !isNote && 'border-dashed bg-yellow-100 text-yellow-950 dark:bg-yellow-500/20 dark:text-yellow-50',
        selected && 'ring-2 ring-primary',
      )}
      style={isNote && data.type ? { borderLeft: `4px solid ${TYPE_COLOR[data.type]}` } : undefined}
    >
      {(['top', 'right', 'bottom', 'left'] as const).map((p) => (
        <Handle key={p} id={p} type="source" position={Position[(p[0]!.toUpperCase() + p.slice(1)) as 'Top']} className="!size-2" />
      ))}
      {isNote ? (
        <>
          <div className="text-[10px] text-muted-foreground uppercase">{data.type ? N.types[data.type] : ''}</div>
          <Link href={`/campaigns/${data.campaignId}/notes/${data.noteId}`} className="nodrag font-medium hover:underline">
            {data.title || N.untitled}
          </Link>
        </>
      ) : (
        <div className="whitespace-pre-wrap">{data.title}</div>
      )}
    </div>
  );
}

const nodeTypes = { note: NoteNode };

export function BoardView(props: { campaignId: string; boardId: string }) {
  return (
    <ReactFlowProvider>
      <BoardInner {...props} />
    </ReactFlowProvider>
  );
}

function edgeView(e: { id: string; fromNodeId: string; toNodeId: string; label: string | null; style: 'solid' | 'dashed' }): Edge {
  return {
    id: e.id,
    source: e.fromNodeId,
    target: e.toNodeId,
    label: e.label ?? undefined,
    data: { style: e.style },
    markerEnd: { type: MarkerType.ArrowClosed },
    style: e.style === 'dashed' ? { strokeDasharray: '6 4' } : undefined,
  };
}

function BoardInner({ campaignId, boardId }: { campaignId: string; boardId: string }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const router = useRouter();
  const resolvedTheme = useResolvedTheme();
  const flow = useReactFlow();
  const board = useQuery({ ...trpc.boards.get.queryOptions({ boardId }), refetchOnWindowFocus: false });
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [search, setSearch] = useState('');
  const [editEdge, setEditEdge] = useState<Edge | null>(null);
  const moved = useRef(new Map<string, { x: number; y: number }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEdit = board.data?.canEdit ?? false;
  const notes = useQuery({ ...trpc.notes.lookup.queryOptions({ campaignId, q: search, limit: 20 }), enabled: canEdit });

  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const b = board.data;
    if (!b || loadedFor.current === `${b.id}`) return;
    loadedFor.current = b.id;
    setNodes(
      b.nodes.map((n) => ({
        id: n.id,
        type: 'note',
        position: { x: n.x, y: n.y },
        data: { noteId: n.noteId, title: n.noteId ? (n.noteTitle ?? '') : (n.label ?? ''), type: (n.noteType as NoteType | null) ?? null, campaignId },
      })),
    );
    setEdges(b.edges.map(edgeView));
  }, [board.data, setNodes, setEdges, campaignId]);

  const flushPositions = useCallback(async () => {
    if (!moved.current.size) return;
    const batch = [...moved.current].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    moved.current.clear();
    try {
      await client.boards.nodes.upsert.mutate({ boardId, nodes: batch });
    } catch (e) {
      toast.error(trpcErrorText(e));
    }
  }, [client, boardId]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flushPositions();
    },
    [flushPositions],
  );

  const handleNodesChange = (changes: NodeChange<BoardNode>[]) => {
    onNodesChange(changes);
    if (!canEdit) return;
    let any = false;
    for (const c of changes) {
      if (c.type === 'position' && c.position && !c.dragging) {
        moved.current.set(c.id, c.position);
        any = true;
      }
    }
    if (any) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushPositions(), POSITION_DEBOUNCE_MS);
    }
  };

  const addNode = async (input: { noteId?: string; label?: string; title: string; type: NoteType | null }, position: { x: number; y: number }) => {
    try {
      const { ids } = await client.boards.nodes.upsert.mutate({
        boardId,
        nodes: [{ noteId: input.noteId ?? null, label: input.label ?? null, x: position.x, y: position.y }],
      });
      setNodes((ns) => [
        ...ns,
        { id: ids[0]!, type: 'note', position, data: { noteId: input.noteId ?? null, title: input.title, type: input.type, campaignId } },
      ]);
    } catch (e) {
      toast.error(trpcErrorText(e));
    }
  };

  const onConnect = async (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    try {
      const { id } = await client.boards.edges.upsert.mutate({ boardId, fromNodeId: c.source, toNodeId: c.target, style: 'solid', label: null });
      setEdges((es) => [...es, edgeView({ id, fromNodeId: c.source, toNodeId: c.target, label: null, style: 'solid' })]);
    } catch (e) {
      toast.error(trpcErrorText(e));
    }
  };

  const deleteBoard = useMutation(
    trpc.boards.delete.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: trpc.boards.list.queryKey() });
        router.push(`/campaigns/${campaignId}/boards`);
      },
    }),
  );
  const onNodes = useMemo(() => nodes.map((n) => n.data.noteId).filter(Boolean) as string[], [nodes]);

  return (
    <>
      <NotesHeader
        campaignId={campaignId}
        section="boards"
        actions={
          board.data?.isOwner && (
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm(B.deleteConfirm)) deleteBoard.mutate({ boardId });
              }}
            >
              <Trash2Icon />
              {B.deleteBoard}
            </Button>
          )
        }
      />
      <QueryState isLoading={board.isLoading} error={board.error}>
        <div className="mb-2 flex items-center gap-2">
          <Button asChild size="icon-sm" variant="ghost" aria-label={ru.common.back}>
            <Link href={`/campaigns/${campaignId}/boards`}>
              <ArrowLeftIcon />
            </Link>
          </Button>
          <h2 className="text-lg font-semibold">{board.data?.name}</h2>
        </div>
        <div className={cn('grid gap-3', canEdit && 'lg:grid-cols-[240px_minmax(0,1fr)]')}>
          {canEdit && (
            <aside className="grid content-start gap-2">
              <p className="text-xs text-muted-foreground">{B.hint}</p>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={N.searchPlaceholder} aria-label={N.searchPlaceholder} />
              <ul className="grid max-h-[50vh] gap-1 overflow-y-auto" data-testid="board-notes">
                {notes.data
                  ?.filter((n) => !onNodes.includes(n.id))
                  .map((n) => (
                    <li
                      key={n.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-note', JSON.stringify({ id: n.id, title: n.title, type: n.type }));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      className="flex cursor-grab items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
                    >
                      <span className="truncate">{n.title || N.untitled}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs"
                        aria-label={`${B.addNote}: ${n.title || N.untitled}`}
                        onClick={() => {
                          const vp = flow.getViewport();
                          void addNode({ noteId: n.id, title: n.title, type: n.type }, { x: -vp.x / vp.zoom + 80 + nodes.length * 12, y: -vp.y / vp.zoom + 80 + nodes.length * 12 });
                        }}
                      >
                        +
                      </Button>
                    </li>
                  ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const label = window.prompt(B.labelPrompt)?.trim();
                  if (!label) return;
                  const vp = flow.getViewport();
                  void addNode({ label: label.slice(0, 200), title: label.slice(0, 200), type: null }, { x: -vp.x / vp.zoom + 120, y: -vp.y / vp.zoom + 120 });
                }}
              >
                <StickyNoteIcon />
                {B.addLabel}
              </Button>
            </aside>
          )}
          <div
            className="h-[72vh] rounded-lg border"
            data-testid="board-canvas"
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              const raw = e.dataTransfer.getData('application/x-note');
              if (!raw) return;
              const n = JSON.parse(raw) as { id: string; title: string; type: NoteType };
              void addNode({ noteId: n.id, title: n.title, type: n.type }, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(c) => void onConnect(c)}
              onNodesDelete={(del) => {
                for (const n of del) void client.boards.nodes.delete.mutate({ boardId, nodeId: n.id }).catch((e) => toast.error(trpcErrorText(e)));
              }}
              onEdgesDelete={(del) => {
                for (const ed of del) void client.boards.edges.delete.mutate({ boardId, edgeId: ed.id }).catch((e) => toast.error(trpcErrorText(e)));
              }}
              onEdgeClick={(_, e) => canEdit && setEditEdge(e)}
              connectionMode={ConnectionMode.Loose}
              nodesDraggable={canEdit}
              nodesConnectable={canEdit}
              deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
              colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
              fitView
              fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        </div>
      </QueryState>
      <EdgeDialog
        edge={editEdge}
        onClose={() => setEditEdge(null)}
        onSave={async (label, style) => {
          if (!editEdge) return;
          try {
            await client.boards.edges.upsert.mutate({ boardId, id: editEdge.id, fromNodeId: editEdge.source, toNodeId: editEdge.target, label: label || null, style });
            setEdges((es) => es.map((e) => (e.id === editEdge.id ? edgeView({ id: e.id, fromNodeId: e.source, toNodeId: e.target, label: label || null, style }) : e)));
          } catch (e) {
            toast.error(trpcErrorText(e));
          }
          setEditEdge(null);
        }}
        onDelete={async () => {
          if (!editEdge) return;
          await client.boards.edges.delete.mutate({ boardId, edgeId: editEdge.id }).catch((e) => toast.error(trpcErrorText(e)));
          setEdges((es) => es.filter((e) => e.id !== editEdge.id));
          setEditEdge(null);
        }}
      />
    </>
  );
}

function EdgeDialog({
  edge,
  onClose,
  onSave,
  onDelete,
}: {
  edge: Edge | null;
  onClose: () => void;
  onSave: (label: string, style: 'solid' | 'dashed') => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={!!edge} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        {edge && <EdgeForm key={edge.id} edge={edge} onSave={onSave} onDelete={onDelete} />}
      </DialogContent>
    </Dialog>
  );
}

function EdgeForm({ edge, onSave, onDelete }: { edge: Edge; onSave: (label: string, style: 'solid' | 'dashed') => void; onDelete: () => void }) {
  const [label, setLabel] = useState(typeof edge.label === 'string' ? edge.label : '');
  const [style, setStyle] = useState<'solid' | 'dashed'>((edge.data as { style?: 'solid' | 'dashed' } | undefined)?.style ?? 'solid');
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(label.trim(), style);
      }}
    >
      <DialogHeader>
        <DialogTitle>{B.edgeLabel}</DialogTitle>
      </DialogHeader>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} aria-label={B.edgeLabel} autoFocus />
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">{B.edgeStyle}</Label>
        <Select value={style} onValueChange={(v) => setStyle(v as 'solid' | 'dashed')}>
          <SelectTrigger aria-label={B.edgeStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">{B.solid}</SelectItem>
            <SelectItem value="dashed">{B.dashed}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onDelete}>
          <Trash2Icon />
          {B.deleteEdge}
        </Button>
        <Button type="submit">{ru.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
