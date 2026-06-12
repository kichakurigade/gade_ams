import type { Metadata } from 'next';
import { KycAmlFormClient } from '@/components/ams/KycAmlForm';

export const metadata: Metadata = { title: 'KYC / AML Evaluation' };

export default function KycPage({ params }: { params: { id: string } }) {
  return <KycAmlFormClient engagementId={params.id} />;
}
