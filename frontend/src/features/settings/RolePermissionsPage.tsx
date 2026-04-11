import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Switch } from '@/components/ui/switch';
import { Shield } from 'lucide-react';

/**
 * Role Permissions matrix.
 *
 * Per-tenant grid of (page × role) toggles. Two columns — store_manager
 * and store_staff. Admin column is intentionally omitted because admin
 * always has full access.
 *
 * Each toggle is an optimistic mutation: we flip the local cache
 * immediately, fire PUT /api/role-permissions in the background, and on
 * error roll back + show a toast.
 */

type MatrixRole = 'store_manager' | 'store_staff';

interface PageMeta {
  key: string;
  label: string;
  description: string;
}

interface MatrixResponse {
  pages: PageMeta[];
  roles: readonly MatrixRole[];
  matrix: Record<MatrixRole, Record<string, boolean>>;
}

const QUERY_KEY = ['settings', 'role-permissions'] as const;

export function RolePermissionsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<MatrixResponse>('/role-permissions');
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ role, pageKey, allowed }: { role: MatrixRole; pageKey: string; allowed: boolean }) =>
      apiClient.put('/role-permissions', { role, pageKey, allowed }),
    // Optimistic update — flip the cache immediately so the toggle feels
    // instant. Roll back on error.
    onMutate: async ({ role, pageKey, allowed }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<MatrixResponse>(QUERY_KEY);
      if (prev) {
        queryClient.setQueryData<MatrixResponse>(QUERY_KEY, {
          ...prev,
          matrix: {
            ...prev.matrix,
            [role]: { ...prev.matrix[role], [pageKey]: allowed },
          },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast.error('Failed to update permission');
    },
    onSuccess: () => {
      // No invalidate — the optimistic update is the source of truth and
      // a refetch would just cause a flash.
    },
  });

  const handleToggle = (role: MatrixRole, pageKey: string, allowed: boolean) => {
    updateMutation.mutate({ role, pageKey, allowed });
  };

  const matrix = data?.matrix;
  const pages = useMemo(() => data?.pages ?? [], [data]);

  return (
    <div>
      <PageHeader
        title="Role Permissions"
        description="Control which pages each role can access. Admin always has full access."
      />

      {/* Admin notice */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-(--border-default) bg-(--surface-secondary) p-4">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <p className="text-sm text-(--text-secondary)">
          <strong className="text-(--text-primary)">Admin</strong> role always has full access and cannot be modified.
        </p>
      </div>

      {/* Matrix */}
      <div className="overflow-hidden rounded-xl border border-(--border-default) bg-(--surface-secondary)">
        <table className="w-full text-sm">
          <thead className="border-b border-(--border-default) bg-(--surface-tertiary)/50 text-left text-xs uppercase tracking-wider text-(--text-tertiary)">
            <tr>
              <th className="px-4 py-3 font-medium">Page</th>
              <th className="px-4 py-3 text-center font-medium">
                <span className="text-warning">Store Manager</span>
              </th>
              <th className="px-4 py-3 text-center font-medium">
                <span className="text-info">Store Staff</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border-default)">
            {isLoading || !matrix ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-4">
                    <div className="h-4 w-40 rounded bg-(--surface-tertiary)" />
                    <div className="mt-1.5 h-3 w-56 rounded bg-(--surface-tertiary)/60" />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="mx-auto h-6 w-11 rounded-full bg-(--surface-tertiary)" />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="mx-auto h-6 w-11 rounded-full bg-(--surface-tertiary)" />
                  </td>
                </tr>
              ))
            ) : (
              pages.map((page) => (
                <tr key={page.key} className="transition-colors hover:bg-(--surface-tertiary)/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-(--text-primary)">{page.label}</p>
                    <p className="text-xs text-(--text-tertiary)">{page.description}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center">
                      <Switch
                        checked={!!matrix.store_manager?.[page.key]}
                        onCheckedChange={(c) => handleToggle('store_manager', page.key, c)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center">
                      <Switch
                        checked={!!matrix.store_staff?.[page.key]}
                        onCheckedChange={(c) => handleToggle('store_staff', page.key, c)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
