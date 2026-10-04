import { EntityView } from '@/features/library/entity-view';

export default async function LibraryEntityPage({
  params,
}: {
  params: Promise<{ kind: string; pack: string; slug: string[] }>;
}) {
  const { kind, pack, slug } = await params;
  return <EntityView entityKey={`${decodeURIComponent(pack)}/${decodeURIComponent(kind)}/${slug.map(decodeURIComponent).join('/')}`} />;
}
