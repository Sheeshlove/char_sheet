'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UploadIcon } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/client';
import { errorMessage, ru } from '@/i18n/ru';
import { Button } from '@/components/ui/button';
import { Portrait } from './character-card';

const D = ru.builder.description;

/** Загрузка портрета (≤ 5 МБ, обрезка до 512×512 на сервере, SPEC §9 шаг 7). */
export function PortraitUpload({ characterId, url, name }: { characterId: string; url: string | null; name: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(ru.errors.fileTooLarge);
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set('file', file);
    form.set('attachedType', 'portrait');
    form.set('attachedId', characterId);
    try {
      const res = await fetch('/api/files', { method: 'POST', body: form, credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(errorMessage(body.error));
        return;
      }
      toast.success(D.uploaded);
      await qc.invalidateQueries({ queryKey: trpc.characters.get.queryKey({ characterId }) });
      await qc.invalidateQueries({ queryKey: trpc.characters.listMine.queryKey() });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-4">
      <Portrait url={url} name={name || '?'} className="size-24" />
      <div className="grid gap-1">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={D.upload}
          data-testid="portrait-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
        <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          <UploadIcon />
          {D.upload}
        </Button>
        <p className="text-xs text-muted-foreground">{D.portraitHint}</p>
      </div>
    </div>
  );
}
