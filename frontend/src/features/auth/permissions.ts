import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from './store';

/**
 * Frontend mirror of the backend permission system.
 *
 * - useRolePermissions() fetches the matrix once and caches it.
 * - canAccessPage(role, pageKey, matrix) is the single source of truth
 *   for "should this user see this nav item / page".
 * - PAGE_KEY_FOR_PATH maps router paths to backend page_keys so the
 *   sidebar and route guards can talk to the same registry.
 *
 * Admin users always pass — they never consult the matrix.
 */

export type Role = 'admin' | 'store_manager' | 'store_staff';

export interface MatrixResponse {
  pages: { key: string; label: string; description: string }[];
  roles: readonly ('store_manager' | 'store_staff')[];
  matrix: Record<'store_manager' | 'store_staff', Record<string, boolean>>;
}

const QUERY_KEY = ['settings', 'role-permissions'] as const;

export function useRolePermissions() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<MatrixResponse>('/role-permissions');
      return data;
    },
    // Stale after 1 minute — permissions don't change often, but we
    // still want refreshes to feel reasonably live for admins toggling
    // things in another tab.
    staleTime: 60_000,
  });
}

export function canAccessPage(
  role: string | undefined,
  pageKey: string | undefined,
  matrix: MatrixResponse | undefined,
): boolean {
  if (!role) return false;
  if (role === 'admin' || role === 'owner') return true; // legacy 'owner'
  if (!pageKey) return true; // ungated page
  if (!matrix) return false;
  if (role === 'store_manager' || role === 'manager') {
    return !!matrix.matrix.store_manager?.[pageKey];
  }
  if (role === 'store_staff' || role === 'staff') {
    return !!matrix.matrix.store_staff?.[pageKey];
  }
  return false;
}

/**
 * Router path → backend page_key. Keep this in sync with PAGES in
 * backend/src/shared/permissions.ts. Routes that aren't gated (like
 * /login) are simply absent from this map.
 */
export const PAGE_KEY_FOR_PATH: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/orders': 'orders.view',
  '/orders/create': 'orders.create',
  '/products': 'products',
  '/inventory': 'inventory',
  '/notifications': 'notifications',
  '/customers': 'customers',
  '/payments': 'payments',
  '/invoices': 'invoices',
  '/catalog': 'catalog',
  '/promotions': 'promotions',
  '/analytics': 'analytics',
  '/cms': 'cms',
  '/locations': 'locations',
  '/users': 'users_permissions',
  '/settings/permissions': 'users_permissions',
  '/settings': 'settings',
};

/**
 * Convenience hook: returns a function `(path) => boolean` that says
 * whether the current user can access that path. Used by the sidebar
 * to filter nav items and by RequirePermission to gate routes.
 */
export function useCanAccessPath(): (path: string) => boolean {
  const role = useAuthStore((s) => s.user?.role);
  const { data } = useRolePermissions();
  return (path: string) => {
    const pageKey = PAGE_KEY_FOR_PATH[path];
    return canAccessPage(role, pageKey, data);
  };
}
