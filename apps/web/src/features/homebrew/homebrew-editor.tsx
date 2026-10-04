'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CONTENT_KINDS, ENTITY_DATA_SCHEMAS, type ContentKind } from '@ps/content-schema';
import { ArrowLeftIcon, DownloadIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { useTRPC, useTRPCClient, trpcErrorText } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { Markdown } from '@/components/markdown';
import { PageHeader } from '@/components/layout/page-header';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { JsonEditor } from './json-editor';
import { EntityPreview } from './preview';
import { SchemaField } from './schema-form';
import { defaultOf, fieldLabel } from './zod-walk';

const H = ru.homebrew;
const PERSONAL = '__personal';

type Initial = {
  key?: string;
  kind: ContentKind;
  nameRu: string;
  nameEn: string;
  textMd: string;
  data: unknown;
  status?: string;
  reviewComment?: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  personal: boolean;
  campaignId: string | null;
};

/** `/homebrew/new` и `/homebrew/:key/edit` (SPEC §14). */
export function HomebrewEditor({ entityKey, initialKind, initialCampaign }: { entityKey?: string; initialKind?: string; initialCampaign?: string | null }) {
  const trpc = useTRPC();
  const entity = useQuery({ ...trpc.homebrew.get.queryOptions({ key: entityKey ?? '' }), enabled: !!entityKey, refetchOnWindowFocus: false });
  if (entityKey) {
    return (
      <QueryState isLoading={entity.isLoading} error={entity.error}>
        {entity.data && (
          <EditorForm
            key={`${entity.data.key}:${entity.dataUpdatedAt}`}
            initial={{
              key: entity.data.key,
              kind: entity.data.kind as ContentKind,
              nameRu: entity.data.nameRu,
              nameEn: entity.data.nameEn ?? '',
              textMd: entity.data.textMd,
              data: entity.data.data,
              status: entity.data.status,
              reviewComment: entity.data.reviewComment,
              canEdit: entity.data.canEdit,
              canSubmit: entity.data.canSubmit,
              personal: entity.data.pack.visibility === 'private',
              campaignId: entity.data.pack.campaignId,
            }}
          />
        )}
      </QueryState>
    );
  }
  const kind = (CONTENT_KINDS as readonly string[]).includes(initialKind ?? '') ? (initialKind as ContentKind) : 'feat';
  return (
    <EditorForm
      initial={{
        kind,
        nameRu: '',
        nameEn: '',
        textMd: '',
        data: defaultOf(ENTITY_DATA_SCHEMAS[kind]),
        canEdit: true,
        canSubmit: false,
        personal: !initialCampaign,
        campaignId: initialCampaign ?? null,
      }}
    />
  );
}

function EditorForm({ initial }: { initial: Initial }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const router = useRouter();
  const me = useQuery(trpc.auth.me.queryOptions());
  const campaigns = useQuery(trpc.campaigns.list.queryOptions());
  const isNew = !initial.key;
  const [kind, setKind] = useState<ContentKind>(initial.kind);
  const [nameRu, setNameRu] = useState(initial.nameRu);
  const [nameEn, setNameEn] = useState(initial.nameEn);
  const [textMd, setTextMd] = useState(initial.textMd);
  const [data, setData] = useState<unknown>(initial.data);
  const [target, setTarget] = useState<string>(initial.campaignId ?? PERSONAL);
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [submitCampaign, setSubmitCampaign] = useState<string>('');
  const readOnly = !initial.canEdit;
  const schema = ENTITY_DATA_SCHEMAS[kind];
  const issues = useMemo(() => {
    const r = schema.safeParse(data);
    return r.success ? [] : r.error.issues.slice(0, 20);
  }, [schema, data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: trpc.homebrew.list.pathKey() });
    void qc.invalidateQueries({ queryKey: ['content-bundle'] });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (isNew) return client.homebrew.create.mutate({ kind, nameRu, nameEn: nameEn || undefined, textMd, data, campaignId: target === PERSONAL ? null : target });
      await client.homebrew.update.mutate({ key: initial.key!, nameRu, nameEn: nameEn || undefined, textMd, data });
      return { key: initial.key!, status: initial.status ?? 'approved' };
    },
    onSuccess: (r) => {
      refresh();
      toast.success(isNew ? H.created : H.saved);
      if (isNew) router.replace(`/homebrew/${r.key}/edit`);
      else void qc.invalidateQueries({ queryKey: trpc.homebrew.get.queryKey({ key: initial.key! }) });
    },
    onError: (e) => toast.error(trpcErrorText(e)),
  });
  const submit = useMutation(
    trpc.homebrew.submit.mutationOptions({
      onSuccess: (r) => {
        refresh();
        toast.success(H.submitted);
        if (r.key !== initial.key) router.push(`/homebrew/${r.key}/edit`);
        else void qc.invalidateQueries({ queryKey: trpc.homebrew.get.queryKey({ key: initial.key! }) });
      },
    }),
  );
  const del = useMutation(
    trpc.homebrew.delete.mutationOptions({
      onSuccess: () => {
        refresh();
        router.push('/homebrew');
      },
    }),
  );
  const exportOverlay = async () => {
    try {
      const overlay = await client.homebrew.exportOverlay.query({ key: initial.key! });
      const blob = new Blob([`${JSON.stringify(overlay, null, 2)}\n`], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${initial.key!.split('/').pop()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error(trpcErrorText(e));
    }
  };
  const switchMode = (m: string) => {
    if (m === 'json') {
      setJsonText(JSON.stringify(data, null, 2));
      setJsonError(null);
    }
    setMode(m as 'form' | 'json');
  };
  const campaignList = campaigns.data?.filter((c) => !c.archivedAt) ?? [];

  return (
    <>
      <PageHeader
        title={isNew ? H.newTitle : nameRu || H.editTitle}
        description={
          !isNew && (
            <>
              <Badge variant="outline">{H.kinds[kind]}</Badge> <Badge variant="secondary">{H.status[initial.status ?? 'approved']}</Badge>
            </>
          )
        }
        actions={
          <Button variant="ghost" asChild>
            <Link href="/homebrew">
              <ArrowLeftIcon />
              {H.title}
            </Link>
          </Button>
        }
      />
      {initial.status === 'rejected' && initial.reviewComment && (
        <p role="status" className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {H.rejected}: {initial.reviewComment}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          className="grid content-start gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly && nameRu.trim() && !issues.length && !jsonError) save.mutate();
          }}
        >
          <fieldset disabled={readOnly} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label>{H.kind}</Label>
                <Select
                  value={kind}
                  disabled={!isNew}
                  onValueChange={(k) => {
                    setKind(k as ContentKind);
                    setData(defaultOf(ENTITY_DATA_SCHEMAS[k as ContentKind]));
                  }}
                >
                  <SelectTrigger aria-label={H.kind} data-testid="hb-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {H.kinds[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isNew && (
                <div className="grid gap-1">
                  <Label>{H.target}</Label>
                  <Select value={target} onValueChange={setTarget}>
                    <SelectTrigger aria-label={H.target} data-testid="hb-target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PERSONAL}>{H.targetPersonal}</SelectItem>
                      {campaignList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {H.targetCampaign(c.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-1">
                <Label htmlFor="hb-name">{H.nameRu}</Label>
                <Input id="hb-name" value={nameRu} onChange={(e) => setNameRu(e.target.value)} maxLength={120} required />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="hb-name-en">{H.nameEn}</Label>
                <Input id="hb-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={120} />
              </div>
            </div>
            <Tabs defaultValue="write">
              <TabsList className="w-auto self-start">
                <TabsTrigger value="write">{H.textMd}</TabsTrigger>
                <TabsTrigger value="preview">{H.preview}</TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <Textarea value={textMd} onChange={(e) => setTextMd(e.target.value)} rows={6} aria-label={H.textMd} />
              </TabsContent>
              <TabsContent value="preview">
                <Markdown className="min-h-24 rounded-md border p-3">{textMd || '—'}</Markdown>
              </TabsContent>
            </Tabs>
            <Tabs value={mode} onValueChange={switchMode}>
              <TabsList className="w-auto self-start">
                <TabsTrigger value="form">{H.formMode}</TabsTrigger>
                <TabsTrigger value="json">{H.jsonMode}</TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="grid gap-3" data-testid="hb-form">
                <SchemaField schema={schema} value={data} onChange={setData} />
              </TabsContent>
              <TabsContent value="json" className="grid gap-2">
                {mode === 'json' && (
                  <JsonEditor
                    value={jsonText}
                    label={H.jsonMode}
                    onChange={(t) => {
                      try {
                        setData(JSON.parse(t));
                        setJsonError(null);
                      } catch (e) {
                        setJsonError(e instanceof Error ? e.message : H.jsonInvalid);
                      }
                    }}
                  />
                )}
                {jsonError && <p className="text-xs text-destructive">{H.jsonInvalid}: {jsonError}</p>}
              </TabsContent>
            </Tabs>
          </fieldset>
          <div className="grid gap-1 rounded-md border p-3 text-sm" data-testid="hb-issues">
            {issues.length ? (
              <>
                <span className="font-medium text-destructive">{H.issues}</span>
                <ul className="list-disc pl-5 text-xs">
                  {issues.map((i, n) => (
                    <li key={n}>
                      {i.path.map((p) => (typeof p === 'number' ? `№${p + 1}` : fieldLabel(String(p)))).join(' › ') || '—'}: {i.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <span className="text-muted-foreground">{H.noIssues}</span>
            )}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.isPending || !nameRu.trim() || issues.length > 0 || !!jsonError} data-testid="hb-save">
                {H.save}
              </Button>
              {initial.canSubmit && (
                <Button type="button" variant="outline" onClick={() => submit.mutate({ key: initial.key! })} data-testid="hb-submit">
                  <SendIcon />
                  {H.submit}
                </Button>
              )}
              {!isNew && initial.personal && campaignList.length > 0 && (
                <div className="flex items-center gap-1">
                  <Select value={submitCampaign} onValueChange={setSubmitCampaign}>
                    <SelectTrigger size="sm" className="w-56" aria-label={H.submitTo}>
                      <SelectValue placeholder={H.submitTo} />
                    </SelectTrigger>
                    <SelectContent>
                      {campaignList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="outline" disabled={!submitCampaign} onClick={() => submit.mutate({ key: initial.key!, campaignId: submitCampaign })}>
                    <SendIcon />
                    {H.submit}
                  </Button>
                </div>
              )}
              {!isNew && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(H.deleteConfirm)) del.mutate({ key: initial.key! });
                  }}
                >
                  <Trash2Icon />
                  {H.delete}
                </Button>
              )}
            </div>
          )}
          {!isNew && me.data?.isAdmin && (
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => void exportOverlay()}>
              <DownloadIcon />
              {H.exportOverlay}
            </Button>
          )}
        </form>
        <aside className="grid content-start gap-4">
          <EntityPreview nameRu={nameRu} data={data} />
        </aside>
      </div>
    </>
  );
}
