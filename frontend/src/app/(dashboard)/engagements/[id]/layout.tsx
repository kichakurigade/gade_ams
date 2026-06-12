import { EngagementTabs } from '@/components/ams/EngagementTabs';

export default function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <div>
      <EngagementTabs engagementId={params.id} />
      {children}
    </div>
  );
}
