import { NotesCompare } from '@/features/notes/notes-compare';

export default async function NotesComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const [{ id }, { ids }] = await Promise.all([params, searchParams]);
  const list = (ids ?? '')
    .split(',')
    .filter((x) => /^[0-9a-f-]{36}$/i.test(x))
    .slice(0, 3);
  return <NotesCompare campaignId={id} ids={[...new Set(list)]} />;
}
