import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  vendorName: string;
  total: number;
  status: string;
  createdAt: string;
}

const columns: ColumnDef<PurchaseOrder>[] = [
  {
    accessorKey: 'orderNumber',
    header: 'PO Number',
    cell: ({ getValue }) => (
      <span className="font-mono font-medium text-primary-500">{getValue<string>()}</span>
    ),
  },
  { accessorKey: 'vendorName', header: 'Vendor' },
  {
    accessorKey: 'total',
    header: 'Total',
    cell: ({ getValue }) => formatCurrency(getValue<number>()),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue<string>();
      return (
        <Badge variant={statusColor(status) as 'success' | 'warning' | 'danger' | 'info' | 'default'}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ getValue }) => formatDate(getValue<string>()),
  },
];

export function PurchaseOrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.purchaseOrders.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ purchaseOrders: PurchaseOrder[] }>('/procurement/orders');
      return data.purchaseOrders;
    },
  });

  return (
    <div>
      <PageHeader title="Purchase Orders" description="Manage procurement orders" />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} emptyMessage="No purchase orders found" />
    </div>
  );
}
