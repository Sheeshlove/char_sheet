import { notFound } from 'next/navigation';
import { HomebrewEditor } from '@/features/homebrew/homebrew-editor';

/** `/homebrew/<pack>/<kind>/<slug>/edit` — ключ сущности содержит «/». */
export default async function HomebrewEditPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  if (slug.length !== 4 || slug[3] !== 'edit') notFound();
  return <HomebrewEditor entityKey={slug.slice(0, 3).map(decodeURIComponent).join('/')} />;
}
