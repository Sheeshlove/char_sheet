import type { Metadata } from 'next';
import { ru } from '@/i18n/ru';
import { CampaignsList } from '@/features/campaigns/campaigns-list';

export const metadata: Metadata = { title: ru.campaigns.title };

export default function CampaignsPage() {
  return <CampaignsList />;
}
