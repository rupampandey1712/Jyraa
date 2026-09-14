'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { BrandMark } from '@/components/BrandMark';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const success = await login(username, password);
    if (success) {
      router.push('/');
    } else {
      setError('Invalid username or password');
    }
    setIsLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded border border-slate-200/80 bg-white/70 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur xl:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden bg-[#201f1e] px-10 py-12 text-white xl:flex xl:flex-col xl:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.2),_transparent_30%)]" />
          <div className="relative">
            <BrandMark compact className="text-white" />
            <h1 className="mt-8 max-w-md text-5xl font-semibold leading-tight">
              Keep projects moving without losing the thread.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
              Sign in to track issues, organize boards, and keep your team aligned in one place.
            </p>
          </div>

          <div className="relative grid grid-cols-2 gap-4 text-sm text-slate-200">
            <div className="rounded-sm border border-white/10 bg-white/5 p-4">
              <p className="text-3xl font-semibold text-white">24</p>
              <p className="mt-1 text-slate-300">active sprints monitored</p>
            </div>
            <div className="rounded-sm border border-white/10 bg-white/5 p-4">
              <p className="text-3xl font-semibold text-white">99.2%</p>
              <p className="mt-1 text-slate-300">workflow completion rate</p>
            </div>
          </div>
        </section>

        <section className="px-6 py-10 sm:px-10 sm:py-12">
          <div className="mx-auto w-full max-w-md">
            <div className="flex items-center gap-4">
              <BrandMark showWordmark={false} />
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
                  Welcome back
                </p>
                <h2 className="mt-1 text-3xl font-semibold text-slate-950">
                  Sign in to ZYRAA
                </h2>
              </div>
            </div>

            <p className="mt-6 text-sm leading-6 text-slate-600">
              Use your account to open boards, manage project health, and keep delivery on track.
            </p>

            <div className="mt-8 rounded border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-8">
              <form className="space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-medium text-red-700">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                    Username
                  </label>
                  <div className="mt-2">
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      placeholder="Enter your username"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                      Secure access
                    </span>
                  </div>
                  <div className="mt-2">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="button-primary inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-4 text-xs uppercase tracking-[0.24em] text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                <span>Or</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <p className="mt-6 text-center text-sm text-slate-600">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="font-semibold text-blue-600 transition hover:text-blue-500">
                  Sign up here
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
