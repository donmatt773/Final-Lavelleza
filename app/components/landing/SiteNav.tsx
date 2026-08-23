'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import logo from '@/app/icons/logo.jpg';
import { theme } from '@/app/lib/landingTheme';

const NAV_LINKS = [
  { label: 'Rooms', href: '#rooms' },
  { label: 'Promos', href: '#promos' },
  { label: 'Reservation', href: '/reservation' },
];

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? `${theme.sand}EE` : 'transparent',
        backdropFilter: scrolled ? 'blur(8px)' : 'none',
        borderBottom: scrolled ? `1px solid ${theme.ink}1A` : '1px solid transparent',
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={logo}
            alt="La Velleza Resort"
            className="h-9 w-9 rounded-full object-cover"
            priority
          />
          <span
            className="font-serif text-lg transition-colors duration-300"
            style={{ color: scrolled ? theme.caramel : theme.sand }}
          >
            La Velleza
          </span>
        </Link>

        <nav className="hidden items-center gap-8 sm:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium transition-colors duration-300"
              style={{ color: scrolled ? theme.royal : `${theme.sand}CC` }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Link
          href="/reservation"
          className="rounded-full px-5 py-2 text-sm font-semibold transition hover:opacity-90"
          style={{ backgroundColor: theme.sunset, color: theme.navy }}
        >
          Book now
        </Link>
      </div>
    </header>
  );
}
