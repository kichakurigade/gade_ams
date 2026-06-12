import type { Metadata } from 'next';
import { EngagementListClient } from '@/components/ams/EngagementList';

export const metadata: Metadata = { title: 'Engagements' };

export default function EngagementsPage() {
  return <EngagementListClient />;
}
