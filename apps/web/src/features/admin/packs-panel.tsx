'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Пакеты контента: версии, число сущностей, перезагрузка из JSON (SPEC §5.2, §7.7). */
export function PacksPanel() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const list = useQuery(trpc.admin.packs.list.queryOptions());
  const reload = useMutation(
    trpc.admin.packs.reload.mutationOptions({
      onSuccess: (r) => {
        toast.success(r.map((x) => `${x.pack}: ${x.status === 'loaded' ? x.entities : ru.common.saved}`).join(', '));
        qc.invalidateQueries({ queryKey: trpc.admin.packs.list.queryKey() });
      },
    }),
  );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{ru.admin.packs}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => reload.mutate({ force: true })} disabled={reload.isPending}>
          {ru.admin.packReload}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ru.library.pack}</TableHead>
              <TableHead>{ru.admin.packEntities}</TableHead>
              <TableHead>{ru.admin.packVersion}</TableHead>
              <TableHead>{ru.admin.packImported}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.map((p) => (
              <TableRow key={p.key}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <code className="text-xs text-muted-foreground">{p.key}</code>
                </TableCell>
                <TableCell>{p.entities}</TableCell>
                <TableCell className="font-mono text-xs">{p.version.slice(0, 12)}</TableCell>
                <TableCell>{formatDateTime(p.importedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
