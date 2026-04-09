import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';

interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  isActive: boolean;
}

const columns: ColumnDef<Vendor>[] = [
  { accessorKey: 'name', header: 'Vendor Name' },
  { accessorKey: 'contactPerson', header: 'Contact Person' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'email', header: 'Email' },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => (
      <Badge variant={getValue<boolean>() ? 'success' : 'danger'}>
        {getValue<boolean>() ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
];

export function VendorListPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.vendors.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ vendors: Vendor[] }>('/procurement/vendors');
      return data.vendors;
    },
  });

  return (
    <div>
      <PageHeader title="Vendors" description="Manage your suppliers and vendors" />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} emptyMessage="No vendors found" />
    </div>
  );
}
