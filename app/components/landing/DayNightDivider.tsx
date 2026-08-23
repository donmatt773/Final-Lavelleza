'use client';

import React, { useState } from 'react';

type Props = {
  checkInTime: string;
  checkOutTime: string;
  halfDayCutoffTime: string;
};

export default function DayNightDivider({ checkInTime, checkOutTime, halfDayCutoffTime }: Props) {
  const [mode, setMode] = useState<'DAY' | 'NIGHT'>('DAY');
  const isDay = mode === 'DAY';

  return (
    <section className="relative overflow-hidden py-20 transition-colors duration-700" style={{ backgroundColor: isDay ? '#F3E9D4' : '#16342A' }}>
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.35em] transition-colors duration-700"
            style={{ color: isDay ? '#2F7A79' : '#E3A23C' }}
          >
            One rate for the day, another for the night
          </p>
          <h2
            className="mt-3 font-serif text-3xl transition-colors duration-700 sm:text-4xl"
            style={{ color: isDay ? '#16342A' : '#F3E9D4' }}
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
              stroke={isDay ? '#2F7A79' : '#E3A23C'}
              strokeWidth="2"
              strokeDasharray="4 8"
              strokeLinecap="round"
              opacity="0.6"
            />
            {/* sun / moon marker sliding along the arc */}
            <circle
              cx={isDay ? 110 : 290}
              cy={isDay ? 46 : 46}
              r="16"
              fill={isDay ? '#E3A23C' : '#F3E9D4'}
              className="transition-all duration-700 ease-out"
            />
            {isDay ? (
              <circle cx="110" cy="46" r="24" fill="none" stroke="#E3A23C" strokeWidth="1" opacity="0.35" className="transition-all duration-700" />
            ) : (
              <circle cx="280" cy="40" r="3" fill="#F3E9D4" opacity="0.8" />
            )}
          </svg>
        </div>

        {/* Toggle control */}
        <div className="mx-auto mt-6 flex w-fit rounded-full border p-1" style={{ borderColor: isDay ? '#16342A33' : '#F3E9D433' }}>
          <button
            type="button"
            onClick={() => setMode('DAY')}
            className="rounded-full px-5 py-2 text-sm font-semibold transition-colors"
            style={{
              backgroundColor: isDay ? '#16342A' : 'transparent',
              color: isDay ? '#F3E9D4' : '#F3E9D4',
            }}
          >
            Day Visit
          </button>
          <button
            type="button"
            onClick={() => setMode('NIGHT')}
            className="rounded-full px-5 py-2 text-sm font-semibold transition-colors"
            style={{
              backgroundColor: !isDay ? '#E3A23C' : 'transparent',
              color: !isDay ? '#16342A' : '#16342A',
            }}
          >
            Overnight Stay
          </button>
        </div>

        {/* Live schedule copy, sourced from real rate settings */}
        <p
          className="mx-auto mt-8 max-w-md text-center text-sm transition-colors duration-700"
          style={{ color: isDay ? '#16342A99' : '#F3E9D499' }}
        >
          {isDay
            ? `Arrive any time before ${halfDayCutoffTime} and you're on the half-day rate — pool, rooms, and grounds until check-out at ${checkOutTime}.`
            : `Check in from ${checkInTime} onward and settle in for the whole-day rate — wake up to the grounds before your ${checkOutTime} check-out.`}
        </p>
      </div>
    </section>
  );
}
