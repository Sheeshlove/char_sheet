import { CampaignOverview } from '@/features/campaigns/campaign-overview';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignOverview campaignId={id} />;
}
