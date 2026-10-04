'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { MinusIcon, PlusIcon, ScanIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { NOTE_TYPES, type NoteType } from '@/lib/notes/schema';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NotesHeader } from './notes-screen';

const N = ru.notes;

export const TYPE_COLOR: Record<NoteType, string> = {
  general: '#a3a3a3',
  session: '#3b82f6',
  npc: '#f97316',
  location: '#22c55e',
  quest: '#eab308',
  faction: '#8b5cf6',
  item: '#06b6d4',
  clue: '#ec4899',
};

type GNode = SimulationNodeDatum & { id: string; title: string; type: NoteType; degree: number };
type GLink = SimulationLinkDatum<GNode>;

/** Граф связей (§11.4): раскладка d3-force, фильтр по типам, клик открывает заметку. */
export function NotesGraph({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const q = useQuery(trpc.notes.graph.queryOptions({ campaignId }));
  const [hidden, setHidden] = useState<Set<NoteType>>(new Set());
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const layout = useMemo(() => {
    if (!q.data) return null;
    const visible = q.data.nodes.filter((n) => !hidden.has(n.type));
    const ids = new Set(visible.map((n) => n.id));
    const edges = q.data.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const nodes: GNode[] = visible.map((n) => ({ ...n, degree: degree.get(n.id) ?? 0 }));
    const links: GLink[] = edges.map((e) => ({ source: e.from, target: e.to }));
    const sim = forceSimulation(nodes)
      .force('link', forceLink<GNode, GLink>(links).id((d) => d.id).distance(90))
      .force('charge', forceManyBody().strength(-260))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(34))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    const xs = nodes.map((n) => n.x ?? 0);
    const ys = nodes.map((n) => n.y ?? 0);
    const pad = 80;
    const box = nodes.length
      ? { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 }
      : { x: -200, y: -150, w: 400, h: 300 };
    return { nodes, links: links as { source: GNode; target: GNode }[], box, hasEdges: edges.length > 0 };
  }, [q.data, hidden]);

  const toggle = (t: NoteType) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <>
      <NotesHeader campaignId={campaignId} section="graph" />
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm" role="group" aria-label={N.graph.filter}>
        {NOTE_TYPES.map((t) => (
          <label key={t} className="flex items-center gap-1.5">
            <Checkbox checked={!hidden.has(t)} onCheckedChange={() => toggle(t)} />
            <span className="size-2.5 rounded-full" style={{ backgroundColor: TYPE_COLOR[t] }} aria-hidden />
            {N.typesPlural[t]}
          </label>
        ))}
        <div className="ml-auto flex gap-1">
          <Button size="icon-sm" variant="outline" aria-label="+" onClick={() => setView((v) => ({ ...v, k: Math.min(4, v.k * 1.25) }))}>
            <PlusIcon />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="−" onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.25) }))}>
            <MinusIcon />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label={ru.common.reset} onClick={() => setView({ k: 1, x: 0, y: 0 })}>
            <ScanIcon />
          </Button>
        </div>
      </div>
      {layout && !layout.hasEdges && <p className="mb-2 text-sm text-muted-foreground">{N.graph.empty}</p>}
      {layout && !layout.nodes.length ? (
        null
      ) : (
        layout && (
          <svg
            viewBox={`${layout.box.x} ${layout.box.y} ${layout.box.w} ${layout.box.h}`}
            className="h-[70vh] w-full cursor-grab touch-none rounded-lg border bg-muted/20 active:cursor-grabbing"
            role="img"
            aria-label={N.graph.title}
            data-testid="notes-graph"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY };
              (e.target as Element).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const svg = e.currentTarget.getBoundingClientRect();
              const scale = layout.box.w / svg.width / view.k;
              const dx = (e.clientX - drag.current.x) * scale;
              const dy = (e.clientY - drag.current.y) * scale;
              drag.current = { x: e.clientX, y: e.clientY };
              setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onWheel={(e) => setView((v) => ({ ...v, k: Math.min(4, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) }))}
          >
            <g
              transform={`translate(${layout.box.x + layout.box.w / 2} ${layout.box.y + layout.box.h / 2}) scale(${view.k}) translate(${-(layout.box.x + layout.box.w / 2) + view.x} ${-(layout.box.y + layout.box.h / 2) + view.y})`}
            >
              {layout.links.map((l, i) => (
                <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} className="stroke-muted-foreground/40" strokeWidth={1.5} />
              ))}
              {layout.nodes.map((n) => (
                <g
                  key={n.id}
                  transform={`translate(${n.x} ${n.y})`}
                  className="cursor-pointer"
                  role="link"
                  tabIndex={0}
                  aria-label={n.title || N.untitled}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => router.push(`/campaigns/${campaignId}/notes/${n.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') router.push(`/campaigns/${campaignId}/notes/${n.id}`);
                  }}
                >
                  <circle r={8 + Math.min(10, n.degree * 2)} fill={TYPE_COLOR[n.type]} className="stroke-background" strokeWidth={2} />
                  <text y={24 + Math.min(10, n.degree * 2)} textAnchor="middle" className="fill-foreground text-[11px]">
                    {(n.title || N.untitled).slice(0, 28)}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        )
      )}
    </>
  );
}
