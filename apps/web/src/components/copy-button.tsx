'use client';
import { useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { ru } from '@/i18n/ru';
import { Button } from '@/components/ui/button';

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* буфер обмена недоступен — пользователь скопирует вручную */
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? ru.common.copied : (label ?? ru.common.copy)}
    </Button>
  );
}
