import { useState, type FormEvent } from 'react';
import { AlertCircle, Check, Eye, EyeOff, Loader2, Lock, Mail, User as UserIcon } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
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

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError('');
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-auth-glow px-4 py-10 safe-top safe-bottom">
      <div className="w-full max-w-[400px]">
        {/* Brand Header */}
        <div className="text-center mb-7">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white inline-flex items-center justify-center shadow-lg shadow-indigo-950/15 mb-4">
            <Check className="w-6 h-6 stroke-[2.75]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">LabCheck</h1>
          <p className="text-sm text-slate-500 mt-1">
            Catat progres & rekap nilai praktikum lebih cepat
          </p>
        </div>

        {/* Auth Card */}
        <div className="surface-card rounded-2xl p-5 sm:p-6">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 bg-slate-100/90 p-1 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`min-h-[38px] rounded-lg text-sm font-semibold transition ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`min-h-[38px] rounded-lg text-sm font-semibold transition ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Daftar Akun
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama asisten laboratorium"
                    className="w-full min-h-[46px] pl-10 pr-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@kampus.ac.id"
                  className="w-full min-h-[46px] pl-10 pr-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'register' ? 6 : 1}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Minimal 6 karakter' : 'Masukkan password'}
                  className="w-full min-h-[46px] pl-10 pr-12 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="min-h-[44px] min-w-[44px] absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm shadow-slate-900/15 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Masuk ke LabCheck' : 'Buat Akun Asisten'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Dirancang untuk asisten laboratorium · Mobile-first & siap cetak A4
        </p>
      </div>
    </div>
  );
}
