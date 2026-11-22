import { useState, type FormEvent } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { User } from '../types';

interface AuthViewProps {
  onSuccess: (user: User) => void;
}

export function AuthView({ onSuccess }: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ name, email, password });
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#fafafa] px-4 py-10 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-md bg-neutral-900 text-white inline-flex items-center justify-center">
              <Check className="w-4 h-4 stroke-[2.5]" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-neutral-900">LabCheck</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {mode === 'login' ? 'Masuk ke akun' : 'Buat akun asisten'}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Pencatatan dan rekap nilai tugas praktikum.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200/90 p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama asisten"
                  className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 bg-white text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@kampus.ac.id"
                className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 bg-white text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={mode === 'register' ? 6 : 1}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Minimal 6 karakter' : '••••••••'}
                className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 bg-white text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
              />
            </div>

            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] rounded-lg bg-neutral-900 hover:bg-neutral-800 active:bg-black disabled:opacity-50 text-white font-medium text-sm inline-flex items-center justify-center gap-2 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Masuk' : 'Daftar'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-neutral-500 mt-5">
          {mode === 'login' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
            className="font-medium text-neutral-900 underline underline-offset-4 hover:text-neutral-700"
          >
            {mode === 'login' ? 'Daftar' : 'Masuk'}
          </button>
        </p>
      </div>
    </div>
  );
}
