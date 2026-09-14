'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { BrandMark } from '@/components/BrandMark';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    display_name: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsLoading(true);
    const success = await register({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      display_name: formData.display_name,
    });

    if (success) {
      router.push('/');
    } else {
      setError('Registration failed. Please try again.');
    }
    setIsLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded border border-slate-200/80 bg-white/70 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur xl:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden bg-[#201f1e] px-10 py-12 text-white xl:flex xl:flex-col xl:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.24),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.18),_transparent_28%)]" />
          <div className="relative">
            <BrandMark compact className="text-white" />
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">
              Create workspace access
            </div>
            <h1 className="mt-8 max-w-md text-5xl font-semibold leading-tight">
              Build your planning hub in a few seconds.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
              Create an account to start organizing projects, visualizing delivery, and collaborating on every issue.
            </p>
          </div>

          <div className="relative space-y-4 text-sm text-slate-200">
            <div className="rounded-sm border border-white/10 bg-white/5 p-4">
              <p className="font-semibold text-white">Track work with clarity</p>
              <p className="mt-1 text-slate-300">Boards, status columns, and issue details stay connected from day one.</p>
            </div>
            <div className="rounded-sm border border-white/10 bg-white/5 p-4">
              <p className="font-semibold text-white">Designed for momentum</p>
              <p className="mt-1 text-slate-300">Set up your account and move straight into projects instead of wrestling the interface.</p>
            </div>
          </div>
        </section>

        <section className="px-6 py-10 sm:px-10 sm:py-12">
          <div className="mx-auto w-full max-w-md">
            <div className="flex items-center gap-4">
              <BrandMark showWordmark={false} />
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
                  New account
                </p>
                <h2 className="mt-1 text-3xl font-semibold text-slate-950">
                  Create your account
                </h2>
              </div>
            </div>

            <p className="mt-6 text-sm leading-6 text-slate-600">
              A few details and you&apos;ll be ready to create boards, manage issues, and invite your team.
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
                      value={formData.username}
                      onChange={handleChange}
                      className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      placeholder="Choose a username"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <div className="mt-2">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="display_name" className="block text-sm font-medium text-slate-700">
                    Display name
                  </label>
                  <div className="mt-2">
                    <input
                      id="display_name"
                      name="display_name"
                      type="text"
                      required
                      value={formData.display_name}
                      onChange={handleChange}
                      className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      placeholder="How your team will see you"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <div className="mt-2">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                    Confirm password
                  </label>
                  <div className="mt-2">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      placeholder="Re-enter your password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="button-primary inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creating account...' : 'Create account'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-emerald-600 transition hover:text-emerald-500">
                  Sign in here
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
