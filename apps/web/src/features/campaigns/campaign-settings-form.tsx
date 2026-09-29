'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AbilityMethod, CampaignSettings } from '@ps/content-schema';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/layout/page-header';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CampaignNav } from './campaign-nav';

const S = ru.campaignSettings;
const KNOWN_PACKS = ['srd', 'dndsu-official', 'dndsu-homebrew'];
const ABILITY_METHODS: AbilityMethod[] = ['standard_array', 'point_buy', 'roll', 'manual'];

function EnumSelect<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CampaignSettingsForm({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const campaign = useQuery(trpc.campaigns.get.queryOptions({ campaignId }));
  const dbPacks = useQuery(trpc.content.packs.queryOptions());
  const [s, setS] = useState<CampaignSettings | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourcesText, setSourcesText] = useState('');
  const [langsText, setLangsText] = useState('');

  useEffect(() => {
    if (campaign.data && !s) {
      setS(campaign.data.settings);
      setName(campaign.data.name);
      setDescription(campaign.data.description);
      setSourcesText(campaign.data.settings.allowedSources === 'all' ? '' : campaign.data.settings.allowedSources.join(', '));
      setLangsText(campaign.data.settings.customLanguages.join(', '));
    }
  }, [campaign.data, s]);

  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.campaigns.get.queryKey({ campaignId }) });
  const saveSettings = useMutation(trpc.campaigns.updateSettings.mutationOptions({ onSuccess: invalidate }));
  const saveMeta = useMutation(trpc.campaigns.update.mutationOptions({ onSuccess: invalidate }));
  const archive = useMutation(trpc.campaigns.archive.mutationOptions({ onSuccess: invalidate }));

  const set = <K extends keyof CampaignSettings>(k: K, v: CampaignSettings[K]) => setS((p) => (p ? { ...p, [k]: v } : p));
  const split = (t: string) =>
    t
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s) return;
    const settings: CampaignSettings = {
      ...s,
      allowedSources: sourcesText.trim() ? split(sourcesText) : 'all',
      customLanguages: split(langsText),
    };
    await Promise.all([
      saveMeta.mutateAsync({ campaignId, name, description }),
      saveSettings.mutateAsync({ campaignId, settings }),
    ]);
    toast.success(S.saved);
  };

  const isGm = campaign.data?.role === 'gm' || campaign.data?.role === 'co_gm';
  const packNames = new Map((dbPacks.data ?? []).map((p) => [p.key, p.name]));
  const packs = Array.from(new Set([...KNOWN_PACKS, ...packNames.keys(), ...(s?.allowedPacks ?? [])]));

  return (
    <QueryState isLoading={campaign.isLoading} error={campaign.error}>
      {campaign.data && s && (
        <>
          <PageHeader title={`${ru.campaigns.settings}: ${campaign.data.name}`} />
          <CampaignNav campaignId={campaignId} isGm={isGm} active="settings" />
          <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardContent className="grid gap-4">
                <Field label={ru.campaigns.name} htmlFor="cs-name">
                  <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={!isGm} />
                </Field>
                <Field label={ru.campaigns.description} htmlFor="cs-desc">
                  <Textarea id="cs-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={!isGm} />
                </Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{S.allowedPacks}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {packs.map((p) => (
                  <Label key={p} className="font-normal">
                    <Checkbox
                      checked={s.allowedPacks.includes(p)}
                      onCheckedChange={(v) =>
                        set('allowedPacks', v ? [...s.allowedPacks, p] : s.allowedPacks.filter((x) => x !== p))
                      }
                    />
                    {packNames.get(p) ?? p} <code className="text-xs text-muted-foreground">{p}</code>
                  </Label>
                ))}
                <Field label={S.allowedSources} htmlFor="cs-sources" hint={S.allowedSourcesAll}>
                  <Input id="cs-sources" placeholder="PHB, XGE, TCE" value={sourcesText} onChange={(e) => setSourcesText(e.target.value)} />
                </Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{ru.campaigns.settings}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Label className="justify-between font-normal">
                  {S.featsAllowed}
                  <Switch checked={s.featsAllowed} onCheckedChange={(v) => set('featsAllowed', v)} />
                </Label>
                <Label className="justify-between font-normal">
                  {S.multiclassAllowed}
                  <Switch checked={s.multiclassAllowed} onCheckedChange={(v) => set('multiclassAllowed', v)} />
                </Label>
                <Field label={S.hpMethod} htmlFor="cs-hp">
                  <EnumSelect id="cs-hp" value={s.hpMethod} options={S.hpMethods} onChange={(v) => set('hpMethod', v)} />
                </Field>
                <Field label={S.leveling} htmlFor="cs-lvl">
                  <EnumSelect id="cs-lvl" value={s.leveling} options={S.levelingModes} onChange={(v) => set('leveling', v)} />
                </Field>
                <Field label={S.encumbrance} htmlFor="cs-enc">
                  <EnumSelect id="cs-enc" value={s.encumbrance} options={S.encumbranceModes} onChange={(v) => set('encumbrance', v)} />
                </Field>
                <Field label={S.partySheetVisibility} htmlFor="cs-vis">
                  <EnumSelect
                    id="cs-vis"
                    value={s.partySheetVisibility}
                    options={S.partyVisibilityModes}
                    onChange={(v) => set('partySheetVisibility', v)}
                  />
                </Field>
                <Field label={S.startingGoldMode} htmlFor="cs-gold">
                  <EnumSelect
                    id="cs-gold"
                    value={s.startingGoldMode}
                    options={S.startingGoldModes}
                    onChange={(v) => set('startingGoldMode', v)}
                  />
                </Field>
                <Field label={S.startingLevel} htmlFor="cs-start">
                  <Input
                    id="cs-start"
                    type="number"
                    min={1}
                    max={20}
                    value={s.startingLevel}
                    onChange={(e) => set('startingLevel', Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{S.abilityMethods}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {ABILITY_METHODS.map((m) => (
                  <Label key={m} className="font-normal">
                    <Checkbox
                      checked={s.abilityMethods.includes(m)}
                      onCheckedChange={(v) => {
                        const next = v ? [...s.abilityMethods, m] : s.abilityMethods.filter((x) => x !== m);
                        if (next.length) set('abilityMethods', next);
                      }}
                    />
                    {S.abilityMethodLabels[m]}
                  </Label>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{S.customLanguages}</CardTitle>
              </CardHeader>
              <CardContent>
                <Input value={langsText} onChange={(e) => setLangsText(e.target.value)} aria-label={S.customLanguages} />
              </CardContent>
            </Card>
            <div className="flex flex-wrap gap-2 lg:col-span-2">
              <Button type="submit" disabled={!isGm || saveSettings.isPending}>
                {ru.common.save}
              </Button>
              {campaign.data.role === 'gm' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => archive.mutate({ campaignId, archived: !campaign.data.archivedAt })}
                >
                  {campaign.data.archivedAt ? ru.common.reset : ru.campaigns.archive}
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </QueryState>
  );
}
