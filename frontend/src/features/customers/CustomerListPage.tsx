import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { type ColumnDef } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

const columns: ColumnDef<Customer>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        to={`/customers/${row.original.id}`}
        className="font-medium text-primary-500 hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'email', header: 'Email' },
  {
    accessorKey: 'totalOrders',
    header: 'Orders',
    cell: ({ getValue }) => getValue<number>(),
  },
  {
    accessorKey: 'totalSpent',
    header: 'Total Spent',
    cell: ({ getValue }) => formatCurrency(getValue<number>() / 100),
  },
  {
    accessorKey: 'lastOrderAt',
    header: 'Last Order',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ? formatDate(val) : '-';
    },
  },
];

export function CustomerListPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.customers.list({ search }),
    queryFn: async () => {
      const { data } = await apiClient.get<{ customers: Customer[] }>('/customers', {
        params: { search: search || undefined },
      });
      return data.customers;
    },
  });

  return (
    <div>
      <PageHeader title="Customers" description="Manage your customer base" />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        emptyMessage="No customers found"
      />
    </div>
  );
}
