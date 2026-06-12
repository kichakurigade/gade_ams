import type { Metadata } from 'next';
import { AcceptanceFormClient } from '@/components/ams/AcceptanceForm';

export const metadata: Metadata = { title: 'Engagement Acceptance' };

export default function AcceptancePage({ params }: { params: { id: string } }) {
  return <AcceptanceFormClient engagementId={params.id} />;
}
