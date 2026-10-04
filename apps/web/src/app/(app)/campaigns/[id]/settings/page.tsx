import { CampaignSettingsForm } from '@/features/campaigns/campaign-settings-form';

export default async function CampaignSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignSettingsForm campaignId={id} />;
}
