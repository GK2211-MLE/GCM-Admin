import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle } from 'lucide-react';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export function UsersPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.settings.users(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ users: AdminUser[] }>('/admin/users');
      return data.users;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' }) => {
      await apiClient.patch(`/admin/users/${id}/${action}`);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.users() });
      toast.success(vars.action === 'approve' ? 'User approved' : 'User rejected');
    },
  });

  const columns: ColumnDef<AdminUser>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'role', header: 'Role', cell: ({ getValue }) => <span className="capitalize">{getValue<string>()}</span> },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue<string>();
        const variant = status === 'approved' ? 'success' : status === 'pending' ? 'warning' : 'danger';
        return <Badge variant={variant}>{status}</Badge>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Joined',
      cell: ({ getValue }) => formatDate(getValue<string>()),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const user = row.original;
        if (user.status !== 'pending') return null;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => approveMutation.mutate({ id: user.id, action: 'approve' })}
              className="text-success hover:text-success"
            >
              <CheckCircle className="mr-1 h-4 w-4" /> Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => approveMutation.mutate({ id: user.id, action: 'reject' })}
              className="text-danger hover:text-danger"
            >
              <XCircle className="mr-1 h-4 w-4" /> Reject
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Admin Users" description="Manage admin accounts and approvals" />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} emptyMessage="No admin users found" />
    </div>
  );
}
