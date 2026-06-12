import type { Metadata } from 'next';
import { TeamPanelClient } from '@/components/ams/TeamPanel';

export const metadata: Metadata = { title: 'Engagement Team' };

export default function TeamPage({ params }: { params: { id: string } }) {
  return <TeamPanelClient engagementId={params.id} />;
}
