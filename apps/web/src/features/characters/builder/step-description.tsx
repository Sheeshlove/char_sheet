'use client';
import type { CharacterBuild } from '@ps/content-schema';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PortraitUpload } from '../portrait-upload';
import type { StepProps } from './types';

const D = ru.builder.description;
type Identity = CharacterBuild['identity'];
const SHORT: (keyof Identity & keyof typeof D)[] = ['alignment', 'age', 'height', 'weight', 'eyes', 'skin', 'hair'];
const LONG: [keyof Identity, string][] = [
  ['appearanceMd', D.appearance],
  ['backstoryMd', D.backstory],
  ['alliesMd', D.allies],
];

export function DescriptionStep({ characterId, build, update }: StepProps) {
  const trpc = useTRPC();
  const char = useQuery(trpc.characters.get.queryOptions({ characterId }));
  const set = (k: keyof Identity, v: string) => update((b) => ({ ...b, identity: { ...b.identity, [k]: v } }));
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{ru.builder.steps.description}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label={D.name} htmlFor="id-name">
            <Input id="id-name" value={build.identity.name} maxLength={120} required onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SHORT.map((k) => (
              <Field key={k} label={D[k] as string} htmlFor={`id-${k}`}>
                <Input id={`id-${k}`} value={(build.identity[k] as string | undefined) ?? ''} maxLength={60} onChange={(e) => set(k, e.target.value)} />
              </Field>
            ))}
          </div>
          {LONG.map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`id-${k}`}>
              <Textarea id={`id-${k}`} rows={4} value={(build.identity[k] as string | undefined) ?? ''} onChange={(e) => set(k, e.target.value)} />
            </Field>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{D.portrait}</CardTitle>
        </CardHeader>
        <CardContent>
          <PortraitUpload characterId={characterId} url={char.data?.portraitUrl ?? null} name={build.identity.name} />
        </CardContent>
      </Card>
    </>
  );
}
