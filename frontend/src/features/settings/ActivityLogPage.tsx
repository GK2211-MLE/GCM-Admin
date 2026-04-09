import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Clock } from 'lucide-react';

export function ActivityLogPage() {
  return (
    <div>
      <PageHeader title="Activity Log" description="Track system activity and changes" />
      <EmptyState
        icon={<Clock className="h-8 w-8" />}
        title="Coming soon"
        description="Activity logging will be available in a future update."
      />
    </div>
  );
}
