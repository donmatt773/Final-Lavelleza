'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';


export default function LoginPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      // Securely dispatch a POST request to your backend API route
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employeeId.trim(), password }),
      });

      const data = await response.json().catch(() => null);
      const backendMessage = typeof data?.message === 'string' ? data.message : 'Unexpected response from the authentication server.';

      if (!response.ok) {
        setStatus({
          type: 'error',
          message: `Login failed: ${backendMessage}`,
        });
        setLoading(false);
        return;
      }

      // Normalize role in case it arrives as a string like "0" or "1".
      const normalizedRole = Number(data?.role);
      const safeName = String(data?.name || 'User');

      if (normalizedRole === 0 || normalizedRole === 1) {
        localStorage.setItem('auth_role', String(normalizedRole));
        localStorage.setItem('auth_name', safeName);

        const targetDashboard = normalizedRole === 0 ? '/dashboard/owner' : '/dashboard/staff';
        setStatus({
          type: 'success',
          message: `Login successful. Welcome back, ${safeName}. Redirecting to your dashboard...`,
        });

        router.push(targetDashboard);
        return;
      }

      setStatus({
        type: 'error',
        message: `Login succeeded but role "${String(data?.role)}" is not allowed for dashboard access. Please contact the owner/admin.`,
      });

    } catch {
      setStatus({
        type: 'error',
        message: 'Could not connect to the authentication server. Please check your network or backend server.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-950 via-slate-900 to-zinc-900 p-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-8 shadow-2xl border border-slate-800">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-xl border border-emerald-500/20 mb-3">
            LV
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Management Console</h1>
          <p className="mt-1.5 text-xs font-medium tracking-wide uppercase text-slate-400">La Velleza Resort Staff Portal</p>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-5">
          {status ? (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-lg border px-4 py-3 text-xs ${status.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : 'border-rose-500/30 bg-rose-950/20 text-rose-300'}`}
            >
              {status.message}
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Employee ID</label>
            <input 
              type="text" 
              required
              disabled={loading}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="OWNER-01 or STAFF-01"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-600 transition-all focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Security Key / Password</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 pr-14 text-sm text-white placeholder-slate-600 transition-all focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white tracking-wide shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-emerald-800"
          >
            {loading ? 'Authenticating...' : 'Authenticate & Access Terminal'}
          </button>
        </form>

        <div className="mt-6 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300">⚙️ Secure API Mode Active:</p>
          <p>The code is processing requests strictly inside the node runtime system environment away from the client browser interface layer.</p>
        </div>
      </div>
    </main>
  );
}