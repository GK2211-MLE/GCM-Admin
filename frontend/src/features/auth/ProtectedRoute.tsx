import { Outlet, Navigate } from 'react-router';
import { useAuthStore } from '@/features/auth/store';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
