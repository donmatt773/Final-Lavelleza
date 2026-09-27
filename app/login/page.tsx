'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import logo from '@/app/icons/logo.jpg';
import { theme } from '@/app/lib/landingTheme';


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
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-6" style={{ backgroundColor: theme.sand, color: theme.ink }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border bg-[#FFFDF8] shadow-xl" style={{ borderColor: `${theme.navy}26`, boxShadow: `0 20px 50px ${theme.navy}1F` }}>
        <header className="px-6 py-8 text-center sm:px-8" style={{ background: `linear-gradient(135deg, ${theme.navy}, ${theme.royal} 58%, ${theme.navy})` }}>
          <Image src={logo} alt="La Velleza Resort" className="mb-3 inline-block h-12 w-12 rounded-full object-cover ring-2 ring-white/50" priority />
          <h1 className="font-serif text-2xl font-semibold" style={{ color: theme.sand }}>Management Console</h1>
          <p className="mt-1.5 text-xs font-medium uppercase tracking-wide" style={{ color: `${theme.sand}C2` }}>La Velleza Resort Staff Portal</p>
        </header>

        <div className="p-6 sm:p-8">
        <form onSubmit={handleLoginSubmit} className="space-y-5">
          {status ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border px-4 py-3 text-xs"
              style={status.type === 'success'
                ? { borderColor: '#4C8C4A66', backgroundColor: '#4C8C4A14', color: '#275D2A' }
                : { borderColor: `${theme.coral}66`, backgroundColor: `${theme.coral}14`, color: '#9E3327' }}
            >
              {status.message}
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider" style={{ color: theme.navy }}>Employee ID or Username</label>
            <input 
              type="text" 
              required
              disabled={loading}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="ADMIN, USER-001, or username"
              className="w-full rounded-lg border px-4 py-2.5 text-sm placeholder:text-[#738095] focus:border-[#2E5AA8] focus:outline-none focus:ring-1 focus:ring-[#2E5AA8] disabled:opacity-50"
              style={{ borderColor: `${theme.ink}33`, backgroundColor: '#FFFFFF', color: theme.ink }}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider" style={{ color: theme.navy }}>Security Key / Password</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border px-4 py-2.5 pr-14 text-sm placeholder:text-[#738095] focus:border-[#2E5AA8] focus:outline-none focus:ring-1 focus:ring-[#2E5AA8] disabled:opacity-50"
                style={{ borderColor: `${theme.ink}33`, backgroundColor: '#FFFFFF', color: theme.ink }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold transition hover:opacity-75"
                style={{ color: theme.royal }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold tracking-wide shadow-sm transition-all hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[#F7C948] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: theme.sunset, color: theme.navy }}
          >
            {loading ? 'Authenticating...' : 'Authenticate & Access Terminal'}
          </button>
          <Link
            href="/"
            className="block pt-1 text-center text-sm transition hover:underline focus-visible:outline-none focus-visible:underline"
            style={{ color: theme.royal }}
          >
            Back to home
          </Link>
        </form>

        <div className="mt-6 space-y-1 border-t pt-5 text-[11px]" style={{ borderColor: `${theme.ink}1A`, color: `${theme.ink}B3` }}>
          <p className="font-semibold" style={{ color: theme.navy }}>⚙️ Secure API Mode Active:</p>
          <p>The code is processing requests strictly inside the node runtime system environment away from the client browser interface layer.</p>
        </div>
        </div>
      </div>
    </main>
  );
}