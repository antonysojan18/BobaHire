'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('boba_admin_active', 'true');
        }
        router.push('/admin');
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid credentials');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#a53861] p-4 font-sans selection:bg-[#5f7f7a] selection:text-white">
      <div className="relative z-10 w-full max-w-md">
        {/* Main White Card */}
        <div className="overflow-hidden rounded-3xl bg-white p-8 shadow-2xl transition-all duration-300">

          {/* Header */}
          <div className="text-center">
            <div className="relative mx-auto inline-flex h-24 w-24 items-center justify-center rounded-2xl bg-[#a53861] p-1 shadow-md">
              <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-white p-1.5 overflow-hidden">
                <img
                  src="/boba-live-logo.png"
                  alt="Boba Live Logo"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>

            <h1 className="mt-5 font-brand text-4xl font-black tracking-tight text-[#a53861]">
              BobaLive
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-[#5f7f7a]">
              HR Portal
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            {/* Username Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5f7f7a]">
                Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#5f7f7a]">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-xl border border-[#5f7f7a]/30 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all duration-200 focus:border-[#a53861] focus:bg-white focus:ring-2 focus:ring-[#a53861]/20"
                  placeholder="Enter username"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5f7f7a]">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#5f7f7a]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[#5f7f7a]/30 bg-slate-50 py-3 pl-10 pr-11 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all duration-200 focus:border-[#a53861] focus:bg-white focus:ring-2 focus:ring-[#a53861]/20"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#5f7f7a] hover:text-[#a53861] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="rounded-xl border border-[#a53861]/30 bg-[#a53861]/10 p-3.5 text-center text-xs font-semibold text-[#a53861] animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#a53861] py-3.5 px-4 text-sm font-bold text-white shadow-md transition-all duration-200 hover:bg-[#8c2d50] hover:shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  <>
                    <span>Login</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Footer Security Badge */}
          <div className="mt-8 flex items-center justify-center gap-2 border-t border-[#f1d4af] pt-5 text-center text-xs font-medium text-[#5f7f7a]">
            <ShieldCheck className="h-4 w-4 text-[#a53861]" />
            <span>Encrypted Session • BobaLive</span>
          </div>
        </div>
      </div>
    </div>
  );
}


