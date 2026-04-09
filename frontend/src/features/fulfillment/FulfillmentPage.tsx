import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Truck } from 'lucide-react';

export function FulfillmentPage() {
  return (
    <div>
      <PageHeader title="Fulfillment" description="Manage order fulfillment and delivery" />
      <EmptyState
        icon={<Truck className="h-8 w-8" />}
        title="No pending fulfillments"
        description="Orders ready for fulfillment will appear here."
      />
    </div>
  );
}
