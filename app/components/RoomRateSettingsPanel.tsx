'use client';

import React, { useEffect, useState } from 'react';

type RateSettingsForm = {
  checkInTime: string;
  checkOutTime: string;
  extraPersonRate: number;
  childExemptionAge: number;
  extraSingleBedRate: number;
  extraDoubleBedRate: number;
  halfDayCutoffTime: string;
  beforeCutoffRateType: 'HALF_DAY';
  afterCutoffRateType: 'WHOLE_DAY';
};

type Props = {
  active: boolean;
};

const defaultForm: RateSettingsForm = {
  checkInTime: '1:00 PM',
  checkOutTime: '11:00 AM',
  extraPersonRate: 150,
  childExemptionAge: 9,
  extraSingleBedRate: 300,
  extraDoubleBedRate: 500,
  halfDayCutoffTime: '6:00 PM',
  beforeCutoffRateType: 'HALF_DAY',
  afterCutoffRateType: 'WHOLE_DAY',
};

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isValidTime(value: string) {
  return /^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$/i.test(value.trim());
}

export default function RoomRateSettingsPanel({ active }: Props) {
  const [form, setForm] = useState<RateSettingsForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getAuthHeaders = () => {
    const role = localStorage.getItem('auth_role') || '';
    return {
      'x-user-role': role,
    };
  };

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/rate-settings', { headers: getAuthHeaders() });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to load settings');
      }

      const settings = data.settings || defaultForm;
      setForm({
        checkInTime: settings.checkInTime || defaultForm.checkInTime,
        checkOutTime: settings.checkOutTime || defaultForm.checkOutTime,
        extraPersonRate: Number(settings.extraPersonRate ?? defaultForm.extraPersonRate),
        childExemptionAge: Number(settings.childExemptionAge ?? defaultForm.childExemptionAge),
        extraSingleBedRate: Number(settings.extraSingleBedRate ?? defaultForm.extraSingleBedRate),
        extraDoubleBedRate: Number(settings.extraDoubleBedRate ?? defaultForm.extraDoubleBedRate),
        halfDayCutoffTime: settings.halfDayCutoffTime || defaultForm.halfDayCutoffTime,
        beforeCutoffRateType: 'HALF_DAY',
        afterCutoffRateType: 'WHOLE_DAY',
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load settings');
      setMessageType('error');
      setForm(defaultForm);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    const timeoutId = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [active, loadSettings]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!isValidTime(form.checkInTime)) {
      nextErrors.checkInTime = 'Use h:mm AM/PM format.';
    }

    if (!isValidTime(form.checkOutTime)) {
      nextErrors.checkOutTime = 'Use h:mm AM/PM format.';
    }

    if (!isValidTime(form.halfDayCutoffTime)) {
      nextErrors.halfDayCutoffTime = 'Use h:mm AM/PM format.';
    }

    if (!Number.isFinite(form.extraPersonRate) || form.extraPersonRate < 0) {
      nextErrors.extraPersonRate = 'Value must be zero or higher.';
    }

    if (!Number.isFinite(form.childExemptionAge) || form.childExemptionAge < 0) {
      nextErrors.childExemptionAge = 'Value must be zero or higher.';
    }

    if (!Number.isFinite(form.extraSingleBedRate) || form.extraSingleBedRate < 0) {
      nextErrors.extraSingleBedRate = 'Value must be zero or higher.';
    }

    if (!Number.isFinite(form.extraDoubleBedRate) || form.extraDoubleBedRate < 0) {
      nextErrors.extraDoubleBedRate = 'Value must be zero or higher.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!validate()) {
      setMessageType('error');
      setMessage('Please fix validation errors before saving.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/rate-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          checkInTime: form.checkInTime,
          checkOutTime: form.checkOutTime,
          extraPersonRate: Number(form.extraPersonRate),
          childExemptionAge: Number(form.childExemptionAge),
          extraSingleBedRate: Number(form.extraSingleBedRate),
          extraDoubleBedRate: Number(form.extraDoubleBedRate),
          halfDayCutoffTime: form.halfDayCutoffTime,
          beforeCutoffRateType: 'HALF_DAY',
          afterCutoffRateType: 'WHOLE_DAY',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        const errorText = Array.isArray(data?.errors) ? data.errors.join(' ') : data?.message;
        throw new Error(errorText || 'Unable to save settings');
      }

      setMessageType('success');
      setMessage('Rate settings saved successfully.');
      await loadSettings();
    } catch (error) {
      setMessageType('error');
      setMessage(error instanceof Error ? error.message : 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!active) return null;

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 border-b border-slate-800 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Room / Resort Rate Settings</p>
        <h2 className="text-2xl font-semibold text-white">Centralized operational and pricing rules</h2>
      </div>

      {message ? (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/20 bg-rose-500/10 text-rose-300'}`}>
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">Loading settings...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Check-in Time</label>
              <input
                value={form.checkInTime}
                onChange={(event) => setForm({ ...form, checkInTime: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                placeholder="1:00 PM"
              />
              {errors.checkInTime ? <p className="mt-1 text-xs text-rose-400">{errors.checkInTime}</p> : null}
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Check-out Time</label>
              <input
                value={form.checkOutTime}
                onChange={(event) => setForm({ ...form, checkOutTime: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                placeholder="11:00 AM"
              />
              {errors.checkOutTime ? <p className="mt-1 text-xs text-rose-400">{errors.checkOutTime}</p> : null}
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Half-Day Cutoff Time</label>
              <input
                value={form.halfDayCutoffTime}
                onChange={(event) => setForm({ ...form, halfDayCutoffTime: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                placeholder="6:00 PM"
              />
              {errors.halfDayCutoffTime ? <p className="mt-1 text-xs text-rose-400">{errors.halfDayCutoffTime}</p> : null}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-sm text-slate-300">
              <p className="font-medium text-white">Rate Rule Mapping</p>
              <p className="mt-2">Before cutoff: <span className="font-semibold text-emerald-300">Half-Day Room Rate</span></p>
              <p className="mt-1">After cutoff: <span className="font-semibold text-emerald-300">Whole-Day Room Rate</span></p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Extra Person (per person per night)</label>
              <input
                type="number"
                min="0"
                value={form.extraPersonRate}
                onChange={(event) => setForm({ ...form, extraPersonRate: Number(event.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
              <p className="mt-1 text-xs text-slate-500">{peso.format(form.extraPersonRate)}</p>
              {errors.extraPersonRate ? <p className="mt-1 text-xs text-rose-400">{errors.extraPersonRate}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Child Exemption (age and below)</label>
              <input
                type="number"
                min="0"
                value={form.childExemptionAge}
                onChange={(event) => setForm({ ...form, childExemptionAge: Number(event.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
              {errors.childExemptionAge ? <p className="mt-1 text-xs text-rose-400">{errors.childExemptionAge}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Extra Single Bed</label>
              <input
                type="number"
                min="0"
                value={form.extraSingleBedRate}
                onChange={(event) => setForm({ ...form, extraSingleBedRate: Number(event.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
              <p className="mt-1 text-xs text-slate-500">{peso.format(form.extraSingleBedRate)}</p>
              {errors.extraSingleBedRate ? <p className="mt-1 text-xs text-rose-400">{errors.extraSingleBedRate}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Extra Double Bed</label>
              <input
                type="number"
                min="0"
                value={form.extraDoubleBedRate}
                onChange={(event) => setForm({ ...form, extraDoubleBedRate: Number(event.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
              <p className="mt-1 text-xs text-slate-500">{peso.format(form.extraDoubleBedRate)}</p>
              {errors.extraDoubleBedRate ? <p className="mt-1 text-xs text-rose-400">{errors.extraDoubleBedRate}</p> : null}
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
