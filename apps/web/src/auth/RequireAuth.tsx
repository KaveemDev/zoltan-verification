import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from './useAuth';

export function RequireAuth() {
  const { data: me, isLoading, isError } = useMe();
  const location = useLocation();
  if (isLoading) return <p className="p-6 text-slate-600">Loading…</p>;
  if (isError)
    return <p className="p-6 text-red-700">Could not reach the server. Please refresh.</p>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
