import { createUserSchema, type CreateUser, type UserView } from '@app/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useMe } from '../../auth/useAuth';
import { useUserMutations, useUsers } from '../../lib/admin';
import { btn, btnPrimary, Err, input, ist, Page, Panel, td, th } from './ui';

export function UsersPage() {
  const { data: users, isLoading, error } = useUsers();
  const { data: me } = useMe();
  const { create, update } = useUserMutations();
  const form = useForm<CreateUser>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'STAFF' },
  });
  const e = form.formState.errors;

  const resetPassword = (u: UserView) => {
    const password = window.prompt(`New password for ${u.name} (at least 12 characters):`);
    if (password) update.mutate({ id: u.id, password });
  };

  return (
    <Page title="Staff users">
      <Panel>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Role</th>
              <th className={th}>Status</th>
              <th className={th}>Added</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={td} colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {users?.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id} className={u.active ? '' : 'text-slate-400'}>
                  <td className={td}>
                    {u.name}
                    {self && ' (you)'}
                  </td>
                  <td className={td}>{u.email}</td>
                  <td className={td}>
                    <label className="sr-only" htmlFor={`role-${u.id}`}>
                      Role for {u.name}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={self || update.isPending}
                      onChange={(ev) =>
                        update.mutate({ id: u.id, role: ev.target.value as UserView['role'] })
                      }
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="STAFF">Staff</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className={td}>{u.active ? 'Active' : 'Deactivated'}</td>
                  <td className={td}>{ist(u.createdAt)}</td>
                  <td className={`${td} space-x-2 whitespace-nowrap`}>
                    <button
                      className={btn}
                      onClick={() => resetPassword(u)}
                      disabled={update.isPending}
                    >
                      Reset password
                    </button>
                    {!self && (
                      <button
                        className={btn}
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: u.id, active: !u.active })}
                      >
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <Err error={error ?? update.error} />

      <form
        noValidate
        onSubmit={form.handleSubmit((v) =>
          create.mutate(v, { onSuccess: () => form.reset({ role: 'STAFF' }) }),
        )}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <h2 className="font-semibold sm:col-span-2">Add a user</h2>
        {(['name', 'email', 'password'] as const).map((k) => (
          <div key={k}>
            <label htmlFor={`new-${k}`} className="block text-sm font-medium capitalize">
              {k}
            </label>
            <input
              id={`new-${k}`}
              type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'}
              autoComplete={k === 'password' ? 'new-password' : 'off'}
              {...form.register(k)}
              aria-invalid={!!e[k]}
              className={input}
            />
            {e[k] && <p className="text-sm text-red-700">{e[k]?.message}</p>}
          </div>
        ))}
        <div>
          <label htmlFor="new-role" className="block text-sm font-medium">
            Role
          </label>
          <select id="new-role" {...form.register('role')} className={input}>
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Err error={create.error} />
          <button type="submit" className={btnPrimary} disabled={create.isPending}>
            Add user
          </button>
        </div>
      </form>
    </Page>
  );
}
