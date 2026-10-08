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
  emailSubject: string;
  emailBody: string;
  preArrivalEmailSubject: string;
  preArrivalEmailBody: string;
  thankYouEmailSubject: string;
  thankYouEmailBody: string;
  resortAddress: string;
  contactPhone: string;
  reviewUrl: string;
  cancellationPolicy: string;
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
  emailSubject: 'La Velleza reservation {{reservationNumber}} update',
  emailBody: [
    'Dear {{guestName}},',
    '',
    'We are contacting you about your reservation {{reservationNumber}}.',
    'Current status: {{status}}.',
    '',
    '{{roomLabel}}: {{rooms}}',
    'Check-in: {{checkIn}}',
    'Check-out: {{checkOut}}',
    'Guests: {{adults}} adult(s), {{children}} child(ren)',
    'Reservation total: PHP {{total}}',
    '',
    '{{statusMessage}}',
    '',
    'Regards,',
    'La Velleza Resort',
  ].join('\n'),
  preArrivalEmailSubject: "We're Preparing for Your Arrival at La Velleza Resort!",
  preArrivalEmailBody: [
    'Dear {{guestName}},',
    '',
    'Great news — your getaway at La Velleza Resort is almost here! We are preparing everything for your arrival.',
    '',
    'Reservation: {{reservationNumber}}',
    'Check-in: {{checkIn}} (check-in time: {{checkInTime}})',
    'Check-out: {{checkOut}}',
    '{{roomLabel}}: {{rooms}}',
    'Guests: {{adults}} adult(s), {{children}} child(ren)',
    '',
    'Highlights awaiting you:',
    '- Warm hospitality and a freshly prepared room',
    '- Resort amenities ready for your stay',
    '{{specialRequests}}',
    '',
    'If you have any special requests (such as transfers or early check-in), reply to this email or call us at {{contactPhone}}.',
    '',
    'See you soon!',
    'La Velleza Resort',
    '{{resortAddress}}',
  ].join('\n'),
  thankYouEmailSubject: 'Thank you for staying with us at La Velleza Resort!',
  thankYouEmailBody: [
    'Dear {{guestName}},',
    '',
    'Thank you for staying with us at La Velleza Resort.',
    '',
    'It was a pleasure hosting you. We hope you had a wonderful and memorable stay.',
    '',
    'We would love to hear about your experience.',
    'Please take a moment to share your feedback: {{reviewUrl}}',
    '',
    'We look forward to welcoming you back soon.',
    '',
    'Warm regards,',
    'La Velleza Resort',
    '{{resortAddress}}',
    '{{contactPhone}}',
  ].join('\n'),
  resortAddress: 'La Velleza Resort',
  contactPhone: '',
  reviewUrl: '',
  cancellationPolicy: 'Please contact the resort directly for cancellation inquiries.',
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
        emailSubject: settings.emailSubject || defaultForm.emailSubject,
        emailBody: settings.emailBody || defaultForm.emailBody,
        preArrivalEmailSubject: settings.preArrivalEmailSubject || defaultForm.preArrivalEmailSubject,
        preArrivalEmailBody: settings.preArrivalEmailBody || defaultForm.preArrivalEmailBody,
        thankYouEmailSubject: settings.thankYouEmailSubject || defaultForm.thankYouEmailSubject,
        thankYouEmailBody: settings.thankYouEmailBody || defaultForm.thankYouEmailBody,
        resortAddress: settings.resortAddress || defaultForm.resortAddress,
        contactPhone: settings.contactPhone || defaultForm.contactPhone,
        reviewUrl: settings.reviewUrl || defaultForm.reviewUrl,
        cancellationPolicy: settings.cancellationPolicy || defaultForm.cancellationPolicy,
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
          emailSubject: form.emailSubject,
          emailBody: form.emailBody,
          preArrivalEmailSubject: form.preArrivalEmailSubject,
          preArrivalEmailBody: form.preArrivalEmailBody,
          thankYouEmailSubject: form.thankYouEmailSubject,
          thankYouEmailBody: form.thankYouEmailBody,
          resortAddress: form.resortAddress,
          contactPhone: form.contactPhone,
          reviewUrl: form.reviewUrl,
          cancellationPolicy: form.cancellationPolicy,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        const errorText = Array.isArray(data?.errors) ? data.errors.join(' ') : data?.message;
        throw new Error(errorText || 'Unable to save settings');
      }

      setMessageType('success');
      setMessage('Rate and email settings saved successfully.');
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
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-4 shadow-2xl shadow-black/30 sm:p-6">
      <div className="mb-6 border-b border-slate-800 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Rate Settings & Mail</p>
        <h2 className="text-2xl font-semibold text-white">Pricing rules and customer email template</h2>
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

          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div>
              <h3 className="text-base font-semibold text-white">Reservation email</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                These values are used when an owner or staff member sends a reservation email. Available placeholders: {'{{guestName}}'}, {'{{reservationNumber}}'}, {'{{status}}'}, {'{{statusMessage}}'}, {'{{roomLabel}}'}, {'{{rooms}}'}, {'{{checkIn}}'}, {'{{checkOut}}'}, {'{{adults}}'}, {'{{children}}'}, {'{{total}}'}.
              </p>
            </div>
            <div>
              <label htmlFor="email-subject" className="mb-2 block text-sm text-slate-300">Email subject</label>
              <input
                id="email-subject"
                value={form.emailSubject}
                maxLength={200}
                onChange={(event) => setForm({ ...form, emailSubject: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="email-body" className="mb-2 block text-sm text-slate-300">Email message</label>
              <textarea
                id="email-body"
                value={form.emailBody}
                maxLength={10000}
                rows={14}
                onChange={(event) => setForm({ ...form, emailBody: event.target.value })}
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm leading-relaxed text-white outline-none focus:border-emerald-500"
              />
              <p className="mt-1 text-right text-xs text-slate-500">{form.emailBody.length}/10,000</p>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div>
              <h3 className="text-base font-semibold text-white">Pre-arrival email (sent automatically the day before check-in)</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Placeholders: {'{{guestName}}'}, {'{{reservationNumber}}'}, {'{{roomLabel}}'}, {'{{rooms}}'}, {'{{checkIn}}'}, {'{{checkOut}}'}, {'{{checkInTime}}'}, {'{{checkOutTime}}'}, {'{{adults}}'}, {'{{children}}'}, {'{{total}}'}, {'{{specialRequests}}'}, {'{{resortAddress}}'}, {'{{contactPhone}}'}.
              </p>
            </div>
            <div>
              <label htmlFor="pre-arrival-subject" className="mb-2 block text-sm text-slate-300">Subject</label>
              <input
                id="pre-arrival-subject"
                value={form.preArrivalEmailSubject}
                maxLength={200}
                onChange={(event) => setForm({ ...form, preArrivalEmailSubject: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="pre-arrival-body" className="mb-2 block text-sm text-slate-300">Message</label>
              <textarea
                id="pre-arrival-body"
                value={form.preArrivalEmailBody}
                maxLength={10000}
                rows={12}
                onChange={(event) => setForm({ ...form, preArrivalEmailBody: event.target.value })}
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm leading-relaxed text-white outline-none focus:border-emerald-500"
              />
              <p className="mt-1 text-right text-xs text-slate-500">{form.preArrivalEmailBody.length}/10,000</p>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div>
              <h3 className="text-base font-semibold text-white">Thank-you email (sent automatically on check-out)</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Placeholders: {'{{guestName}}'}, {'{{reservationNumber}}'}, {'{{roomLabel}}'}, {'{{rooms}}'}, {'{{checkIn}}'}, {'{{checkOut}}'}, {'{{reviewUrl}}'}, {'{{resortAddress}}'}, {'{{contactPhone}}'}.
              </p>
            </div>
            <div>
              <label htmlFor="thank-you-subject" className="mb-2 block text-sm text-slate-300">Subject</label>
              <input
                id="thank-you-subject"
                value={form.thankYouEmailSubject}
                maxLength={200}
                onChange={(event) => setForm({ ...form, thankYouEmailSubject: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="thank-you-body" className="mb-2 block text-sm text-slate-300">Message</label>
              <textarea
                id="thank-you-body"
                value={form.thankYouEmailBody}
                maxLength={10000}
                rows={12}
                onChange={(event) => setForm({ ...form, thankYouEmailBody: event.target.value })}
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm leading-relaxed text-white outline-none focus:border-emerald-500"
              />
              <p className="mt-1 text-right text-xs text-slate-500">{form.thankYouEmailBody.length}/10,000</p>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div>
              <h3 className="text-base font-semibold text-white">Resort contact details</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">Used by the email placeholders {'{{resortAddress}}'}, {'{{contactPhone}}'}, {'{{reviewUrl}}'}, {'{{cancellationPolicy}}'}.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="resort-address" className="mb-2 block text-sm text-slate-300">Resort address</label>
                <input
                  id="resort-address"
                  value={form.resortAddress}
                  maxLength={500}
                  onChange={(event) => setForm({ ...form, resortAddress: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="contact-phone" className="mb-2 block text-sm text-slate-300">Contact phone</label>
                <input
                  id="contact-phone"
                  value={form.contactPhone}
                  maxLength={100}
                  onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="review-url" className="mb-2 block text-sm text-slate-300">Review / feedback link</label>
                <input
                  id="review-url"
                  value={form.reviewUrl}
                  maxLength={500}
                  onChange={(event) => setForm({ ...form, reviewUrl: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="cancellation-policy" className="mb-2 block text-sm text-slate-300">Cancellation policy</label>
                <textarea
                  id="cancellation-policy"
                  value={form.cancellationPolicy}
                  maxLength={2000}
                  rows={3}
                  onChange={(event) => setForm({ ...form, cancellationPolicy: event.target.value })}
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-emerald-500"
                />
              </div>
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
