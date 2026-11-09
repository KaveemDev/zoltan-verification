import { NavLink, Outlet } from 'react-router';
import { useLogout, useMe } from '../auth/useAuth';

export function DashboardLayout() {
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-t-4 border-b border-t-brand-500 border-b-slate-200 bg-white px-4 py-3">
        <img src="/logo.png" alt="Zoltan Visa" className="h-7 w-auto" />
        <nav aria-label="Main" className="mr-auto flex flex-wrap gap-4 text-sm">
          {[
            ['/', 'Agreements'],
            ...(me?.role === 'ADMIN'
              ? [
                  ['/admin/users', 'Users'],
                  ['/admin/templates', 'Templates'],
                  ['/admin/access-log', 'Access log'],
                  ['/admin/retention', 'Retention'],
                ]
              : []),
          ].map(([to, label]) => (
            <NavLink
              key={to}
              to={to!}
              end={to === '/'}
              className={({ isActive }) =>
                isActive ? 'font-semibold text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">
            {me?.name} ({me?.role})
          </span>
          <button
            onClick={() => logout.mutate()}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
