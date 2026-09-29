'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTRPC } from '@/lib/trpc/client';
import { ru } from '@/i18n/ru';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export function JoinView({ code }: { code: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const preview = useQuery(trpc.campaigns.invites.preview.queryOptions({ code }));
  const join = useMutation(
    trpc.campaigns.join.mutationOptions({
      onSuccess: ({ campaignId }) => {
        toast.success(ru.campaigns.joined);
        router.replace(`/campaigns/${campaignId}`);
      },
    }),
  );
  return (
    <div className="w-full max-w-md">
      <QueryState isLoading={preview.isLoading} error={preview.error}>
        {preview.data && (
          <Card>
            <CardHeader>
              <CardDescription>{ru.campaigns.joinTitle}</CardDescription>
              <CardTitle className="text-xl">{preview.data.name}</CardTitle>
            </CardHeader>
            {preview.data.description && (
              <CardContent className="text-sm whitespace-pre-line text-muted-foreground">{preview.data.description}</CardContent>
            )}
            <CardFooter className="justify-end gap-2">
              <Button variant="ghost" asChild>
                <Link href="/">{ru.common.cancel}</Link>
              </Button>
              {preview.data.alreadyMember ? (
                <Button asChild>
                  <Link href={`/campaigns/${preview.data.campaignId}`}>{ru.common.open}</Link>
                </Button>
              ) : (
                <Button onClick={() => join.mutate({ code })} disabled={join.isPending}>
                  {ru.campaigns.join}
                </Button>
              )}
            </CardFooter>
          </Card>
        )}
      </QueryState>
    </div>
  );
}
