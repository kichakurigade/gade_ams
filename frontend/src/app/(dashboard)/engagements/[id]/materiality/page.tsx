import type { Metadata } from 'next';
import { MaterialityFormClient } from '@/components/ams/MaterialityForm';

export const metadata: Metadata = { title: 'Materiality' };

export default function MaterialityPage({ params }: { params: { id: string } }) {
  return <MaterialityFormClient engagementId={params.id} />;
}
