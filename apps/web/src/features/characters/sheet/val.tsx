'use client';
import { useState } from 'react';
import { PencilIcon } from 'lucide-react';
import type { Val } from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { cn, signed } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSheet } from './context';

const V = ru.sheet.val;

/**
 * Число листа — кнопка: по нажатию расшифровка `Val.parts` и «Переопределить»
 * (значение + причина, SPEC §12.1). Переопределённые числа помечены значком.
 */
type ValButtonProps = {
  val: Val;
  path?: string;
  label: string;
  sign?: boolean;
  className?: string;
  testId?: string;
};

/**
 * Всплывающее окно монтируется при первом нажатии: на листе десятки таких чисел, и окна
 * Radix на каждом заметно замедляют гидратацию на телефоне (SPEC §16.5).
 */
export function ValButton(props: ValButtonProps) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <ValTrigger {...props} onClick={() => setArmed(true)} />;
  return <ValPopover {...props} />;
}

function ValTrigger({
  val,
  label,
  sign = false,
  className,
  testId,
  path: _path,
  ...rest
}: ValButtonProps & Omit<React.ComponentProps<'button'>, 'className'>) {
  const shown = sign ? signed(val.value) : String(val.value);
  return (
    <button
      type="button"
      aria-label={`${label}: ${shown}`}
      data-testid={testId}
      className={cn(
        'inline-flex items-center justify-center gap-0.5 rounded-md px-1 font-semibold tabular-nums hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
        val.overridden && 'text-warning',
        className,
      )}
      {...rest}
    >
      {shown}
      {val.overridden && <PencilIcon className="size-3" aria-hidden />}
    </button>
  );
}

function ValPopover({ val, path, label, sign = false, className, testId }: ValButtonProps) {
  const { character, saveBuild, canEdit } = useSheet();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(val.value));
  const [reason, setReason] = useState('');
  const shown = sign ? signed(val.value) : String(val.value);
  const override = path ? character.build.overrides[path] : undefined;

  const saveOverride = async (remove: boolean) => {
    if (!path) return;
    const overrides = { ...character.build.overrides };
    if (remove) delete overrides[path];
    else overrides[path] = { value: Number(value) || 0, reasonRu: reason.trim() || '—' };
    const ok = await saveBuild({ ...character.build, overrides });
    if (ok) setEditing(false);
  };

  return (
    <Popover defaultOpen onOpenChange={(o) => !o && setEditing(false)}>
      <PopoverTrigger asChild>
        <ValTrigger val={val} label={label} sign={sign} className={className} testId={testId} />
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="mb-2 text-sm font-medium">
          {label}: {shown}
        </p>
        <p className="mb-1 text-xs text-muted-foreground">{V.breakdown}</p>
        <ul className="grid gap-0.5 text-sm">
          {val.parts.map((p, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{p.labelRu}</span>
              <span className="tabular-nums">{signed(p.value)}</span>
            </li>
          ))}
        </ul>
        {val.overridden && (
          <p className="mt-2 text-xs text-warning">
            {V.overridden(val.overridden.computed)}: {val.overridden.reasonRu}
          </p>
        )}
        {canEdit && path && !editing && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setValue(String(val.value));
                setReason(override?.reasonRu ?? '');
                setEditing(true);
              }}
            >
              {V.override}
            </Button>
            {override && (
              <Button size="sm" variant="ghost" onClick={() => void saveOverride(true)}>
                {V.removeOverride}
              </Button>
            )}
          </div>
        )}
        {editing && (
          <form
            className="mt-3 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveOverride(false);
            }}
          >
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={V.value}
            />
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={V.reason}
              aria-label={V.reason}
              maxLength={300}
            />
            <Button type="submit" size="sm">
              {ru.common.save}
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}
