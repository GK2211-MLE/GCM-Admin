import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuthStore } from './store';
import { useRolePermissions, canAccessPage } from './permissions';

/**
 * Wraps a route with a page-permission check. If the current user does
 * not have access to the given pageKey they're bounced to /dashboard
 * with a toast.
 *
 * Usage:
 *   <RequirePermission pageKey="customers">
 *     <CustomerListPage />
 *   </RequirePermission>
 *
 * Admin users always pass without consulting the matrix.
 */
export function RequirePermission({
  pageKey,
  children,
}: {
  pageKey: string;
  children: React.ReactNode;
}) {
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading } = useRolePermissions();
  const navigate = useNavigate();

  const allowed = canAccessPage(role, pageKey, data);

  useEffect(() => {
    if (isLoading) return;
    if (!allowed) {
      toast.error('You do not have access to that page.');
      navigate('/dashboard', { replace: true });
    }
  }, [allowed, isLoading, navigate]);

  // Render nothing while we're either loading the matrix or about to bounce
  // — better than a blink of the protected page.
  if (isLoading || !allowed) return null;
  return <>{children}</>;
}
