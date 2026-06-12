import type { Metadata } from 'next';
import { NewEngagementForm } from '@/components/ams/NewEngagementForm';

export const metadata: Metadata = { title: 'New Engagement' };

export default function NewEngagementPage() {
  return <NewEngagementForm />;
}
