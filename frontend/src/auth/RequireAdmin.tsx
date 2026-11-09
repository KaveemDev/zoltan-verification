import { Outlet } from 'react-router';
import { useMe } from './useAuth';

export function RequireAdmin() {
  const { data: me } = useMe();
  if (me?.role !== 'ADMIN')
    return <p className="text-slate-600">Only admins can open this page.</p>;
  return <Outlet />;
}
