import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '../shared/index';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router';
import { useLogin, useMe } from '../auth/useAuth';

export function LoginPage() {
  const { data: me } = useMe();
  const login = useLogin();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const { register, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  if (me) return <Navigate to={from} replace />;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <img src="/logo.png" alt="Zoltan Visa" className="mb-6 h-10 w-auto self-start" />
      <h1 className="mb-6 text-2xl font-semibold">Staff sign in</h1>
      <form onSubmit={handleSubmit((v) => login.mutate(v))} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            {...register('email')}
            aria-invalid={!!formState.errors.email}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3"
          />
          {formState.errors.email && (
            <p className="mt-1 text-sm text-red-700">{formState.errors.email.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            aria-invalid={!!formState.errors.password}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3"
          />
          {formState.errors.password && (
            <p className="mt-1 text-sm text-red-700">{formState.errors.password.message}</p>
          )}
        </div>
        {login.isError && (
          <p role="alert" className="text-sm text-red-700">
            {login.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
