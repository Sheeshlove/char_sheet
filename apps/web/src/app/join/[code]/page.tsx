import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current';
import { JoinView } from '@/features/campaigns/join-view';

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await getCurrentUser())) redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <JoinView code={code} />
    </main>
  );
}
