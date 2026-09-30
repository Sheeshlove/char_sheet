import { HomebrewEditor } from '@/features/homebrew/homebrew-editor';

export default async function HomebrewNewPage({ searchParams }: { searchParams: Promise<{ kind?: string; campaign?: string }> }) {
  const { kind, campaign } = await searchParams;
  return <HomebrewEditor initialKind={kind} initialCampaign={campaign && /^[0-9a-f-]{36}$/i.test(campaign) ? campaign : null} />;
}
