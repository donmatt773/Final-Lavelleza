'use client';

import React, { useState } from 'react';
import { theme } from '@/app/lib/landingTheme';

type Props = {
  checkInTime: string;
  checkOutTime: string;
  halfDayCutoffTime: string;
};

export default function DayNightDivider({ checkInTime, checkOutTime, halfDayCutoffTime }: Props) {
  const [mode, setMode] = useState<'DAY' | 'NIGHT'>('DAY');
  const isDay = mode === 'DAY';

  return (
    <section className="relative overflow-hidden py-20 transition-colors duration-700" style={{ backgroundColor: isDay ? theme.sand : theme.navy }}>
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.35em] transition-colors duration-700"
            style={{ color: isDay ? theme.royal : theme.gold }}
          >
            One rate for the day, another for the night
          </p>
          <h2
            className="mt-3 font-serif text-3xl transition-colors duration-700 sm:text-4xl"
            style={{ color: isDay ? theme.caramel : theme.sand }}
          >
            Stay till sundown, or stay till sunrise.
          </h2>
        </div>

        {/* Arc + toggle */}
        <div className="relative mx-auto mt-14 h-40 max-w-xl">
          <svg viewBox="0 0 400 140" className="h-full w-full overflow-visible">
            <path
              d="M 20 130 Q 200 -10 380 130"
              fill="none"
              stroke={isDay ? theme.royal : theme.sky}
              strokeWidth="2"
              strokeDasharray="4 8"
              strokeLinecap="round"
              opacity="0.55"
            />
            {/* sun / moon marker sliding along the arc */}
            <circle
              cx={isDay ? 110 : 290}
              cy="46"
              r="16"
              fill={isDay ? theme.sunset : theme.sand}
              className="transition-all duration-700 ease-out"
            />
            {isDay ? (
              <circle cx="110" cy="46" r="24" fill="none" stroke={theme.gold} strokeWidth="1" opacity="0.5" className="transition-all duration-700" />
            ) : (
              <circle cx="280" cy="40" r="3" fill={theme.sky} opacity="0.9" />
            )}
          </svg>
        </div>

        {/* Toggle control */}
        <div className="mx-auto mt-6 flex w-fit rounded-full border p-1" style={{ borderColor: isDay ? `${theme.ink}33` : `${theme.sand}33` }}>
          <button
            type="button"
            onClick={() => setMode('DAY')}
            className="rounded-full px-5 py-2 text-sm font-semibold transition-colors"
            style={{
              backgroundColor: isDay ? theme.navy : 'transparent',
              color: theme.sand,
            }}
          >
            Day Visit
          </button>
          <button
            type="button"
            onClick={() => setMode('NIGHT')}
            className="rounded-full px-5 py-2 text-sm font-semibold transition-colors"
            style={{
              backgroundColor: !isDay ? theme.sunset : 'transparent',
              color: theme.navy,
            }}
          >
            Overnight Stay
          </button>
        </div>

        {/* Live schedule copy, sourced from real rate settings */}
        <p
          className="mx-auto mt-8 max-w-md text-center text-sm transition-colors duration-700"
          style={{ color: isDay ? `${theme.ink}99` : `${theme.sand}99` }}
        >
          {isDay
            ? `Arrive any time before ${halfDayCutoffTime} and you're on the half-day rate — pool, rooms, and grounds until check-out at ${checkOutTime}.`
            : `Check in from ${checkInTime} onward and settle in for the whole-day rate — wake up to the grounds before your ${checkOutTime} check-out.`}
        </p>
      </div>
    </section>
  );
}
