'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ReservationSuccess from '@/app/components/ReservationSuccess';

type RoomOption = {
  _id: string;
  name: string;
  code: string;
};

type PromoOption = {
  _id: string;
  name: string;
  code: string;
  statusCategory?: 'VALID' | 'EXPIRED' | 'INACTIVE';
  roomEligible?: boolean;
  dateEligible?: boolean;
  inclusions?: Array<{
    _id?: string;
    type?: string;
    name?: string;
    description?: string;
    quantity?: number;
  }>;
};

type PricingSummary = {
  currency: 'PHP';
  roomRate: number;
  numberOfNights: number;
  extraPersonFee: number;
  extraBedFee: number;
  promoDiscount: number;
  additionalRoomDiscount: number;
  subtotal: number;
  grandTotal: number;
};

type Props = {
  rooms: RoomOption[];
  mode?: 'public' | 'walk-in';
  onSuccess?: (reservationNumber: string) => void;
  onCancel?: () => void;
};

type FormState = {
  guestName: string;
  email: string;
  phone: string;
  address: string;
  room: string;
  promo: string;
  checkIn: string;
  checkOut: string;
  adults: string;
  children: string;
  paymentMethod: 'CASH_ON_ARRIVAL' | 'GCASH';
  gcashAmountPaid: string;
  gcashReferenceNumber: string;
  gcashProofOfPaymentUrl: string;
  specialRequests: string;
};

const initialForm: FormState = {
  guestName: '',
  email: '',
  phone: '',
  address: '',
  room: '',
  promo: '',
  checkIn: '',
  checkOut: '',
  adults: '1',
  children: '0',
  paymentMethod: 'CASH_ON_ARRIVAL',
  gcashAmountPaid: '',
  gcashReferenceNumber: '',
  gcashProofOfPaymentUrl: '',
  specialRequests: '',
};

const emptyPromoSummary = { validPromos: 0, expiredPromos: 0, inactivePromos: 0, eligiblePromos: 0 };

export default function ReservationForm({ rooms, mode = 'public', onSuccess, onCancel }: Props) {
  const isWalkInMode = mode === 'walk-in';
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<{ reservationNumber: string; guestName: string } | null>(null);
  const [walkInStatus, setWalkInStatus] = useState<'CONFIRMED' | 'CHECKED_IN'>('CONFIRMED');
  const [walkInSuccessMessage, setWalkInSuccessMessage] = useState<string | null>(null);
  const [pricingSummary, setPricingSummary] = useState<PricingSummary | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [eligiblePromos, setEligiblePromos] = useState<PromoOption[]>([]);
  const [promoSummary, setPromoSummary] = useState(emptyPromoSummary);
  const [promoLoading, setPromoLoading] = useState(false);

  const todayMinDate = useMemo(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }, []);

  const canComputePricing = useMemo(
    () => Boolean(form.room && form.checkIn && form.checkOut && Number(form.adults) >= 1 && Number(form.children) >= 0),
    [form.room, form.checkIn, form.checkOut, form.adults, form.children]
  );

  const selectedPromoDetails = useMemo(
    () => (form.room && form.checkIn && form.checkOut ? eligiblePromos.find((promo) => promo._id === form.promo) || null : null),
    [eligiblePromos, form.promo, form.room, form.checkIn, form.checkOut]
  );

  const displayedEligiblePromos = useMemo(
    () => (form.room && form.checkIn && form.checkOut ? eligiblePromos : []),
    [eligiblePromos, form.room, form.checkIn, form.checkOut]
  );

  const displayedPromoSummary = useMemo(
    () => (form.room && form.checkIn && form.checkOut ? promoSummary : emptyPromoSummary),
    [promoSummary, form.room, form.checkIn, form.checkOut]
  );

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if ((field === 'room' || field === 'checkIn' || field === 'checkOut') && current.promo) {
        next.promo = '';
      }
      return next;
    });
  };

  const validate = () => {
    const errors: string[] = [];

    if (!form.guestName.trim()) errors.push('Guest full name is required.');
    if (!form.email.trim()) errors.push('Email address is required.');
    if (!form.phone.trim()) errors.push('Mobile number is required.');
    if (!form.room) errors.push('Selected room is required.');
    if (!form.checkIn) errors.push('Check-in date is required.');
    if (!form.checkOut) errors.push('Check-out date is required.');

    const adults = Number(form.adults);
    if (!Number.isFinite(adults) || adults < 1) errors.push('Adults must be at least 1.');

    const children = Number(form.children);
    if (!Number.isFinite(children) || children < 0) errors.push('Children cannot be negative.');

    if (!isWalkInMode && form.paymentMethod === 'GCASH') {
      const gcashAmount = Number(form.gcashAmountPaid);
      if (!Number.isFinite(gcashAmount) || gcashAmount <= 0) {
        errors.push('GCash amount paid must be greater than zero.');
      }

      if (pricingSummary && gcashAmount > pricingSummary.grandTotal) {
        errors.push('GCash amount paid cannot exceed the computed grand total.');
      }

      if (!form.gcashReferenceNumber.trim()) {
        errors.push('GCash reference number is required.');
      }
    }

    if (form.checkIn && form.checkOut) {
      const checkIn = new Date(form.checkIn);
      const checkOut = new Date(form.checkOut);
      if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime()) && checkOut <= checkIn) {
        errors.push('Check-out date must be later than check-in date.');
      }
    }

    return errors;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setWalkInSuccessMessage(null);

    const clientErrors = validate();
    setValidationErrors(clientErrors);
    if (clientErrors.length > 0) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: form.guestName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          room: form.room,
          promo: form.promo || null,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          adults: Number(form.adults),
          children: Number(form.children),
          specialRequests: form.specialRequests.trim(),
          reservationSource: isWalkInMode ? 'WALK_IN' : 'ONLINE',
          reservationStatus: isWalkInMode ? walkInStatus : 'PENDING',
          paymentMethod: isWalkInMode ? undefined : form.paymentMethod,
          gcashAmountPaid: !isWalkInMode && form.paymentMethod === 'GCASH' ? Number(form.gcashAmountPaid) : undefined,
          gcashReferenceNumber: !isWalkInMode && form.paymentMethod === 'GCASH' ? form.gcashReferenceNumber.trim() : undefined,
          gcashProofOfPaymentUrl: !isWalkInMode && form.paymentMethod === 'GCASH' ? form.gcashProofOfPaymentUrl.trim() : undefined,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setValidationErrors(Array.isArray(data?.errors) ? data.errors.map((item: unknown) => String(item)) : []);
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to submit reservation request.');
      }

      const reservationNumber = String(data?.reservation?.reservationNumber || 'N/A');

      if (isWalkInMode) {
        setWalkInSuccessMessage(`Walk-in booking created successfully. Reservation No.: ${reservationNumber}`);
        onSuccess?.(reservationNumber);
      } else {
        setSuccess({
          reservationNumber,
          guestName: form.guestName.trim(),
        });
      }

      setForm(initialForm);
      setValidationErrors([]);
      setPricingSummary(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit reservation request.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!form.room || !form.checkIn || !form.checkOut) return;

    const timeoutId = window.setTimeout(async () => {
      setPromoLoading(true);
      try {
        const query = new URLSearchParams({
          room: form.room,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
        }).toString();

        const response = await fetch(`/api/reservations/promos?${query}`);
        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.success) {
          setEligiblePromos([]);
          setPromoSummary(emptyPromoSummary);
          return;
        }

        const nextPromos = Array.isArray(data.eligiblePromos) ? data.eligiblePromos as PromoOption[] : [];
        setEligiblePromos(nextPromos);
        setPromoSummary({
          validPromos: Number(data?.summary?.validPromos || 0),
          expiredPromos: Number(data?.summary?.expiredPromos || 0),
          inactivePromos: Number(data?.summary?.inactivePromos || 0),
          eligiblePromos: Number(data?.summary?.eligiblePromos || 0),
        });

      } catch {
        setEligiblePromos([]);
      } finally {
        setPromoLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [form.room, form.checkIn, form.checkOut]);

  useEffect(() => {
    if (!canComputePricing) return;

    const timeoutId = window.setTimeout(async () => {
      setPricingLoading(true);
      try {
        const response = await fetch('/api/reservations/pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: form.room,
            promo: form.promo || null,
            checkIn: form.checkIn,
            checkOut: form.checkOut,
            adults: Number(form.adults),
            children: Number(form.children),
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) {
          setPricingSummary(null);
          return;
        }

        setPricingSummary(data.pricingSummary as PricingSummary);
      } catch {
        setPricingSummary(null);
      } finally {
        setPricingLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canComputePricing, form.room, form.promo, form.checkIn, form.checkOut, form.adults, form.children]);

  if (success) {
    return (
      <ReservationSuccess
        reservationNumber={success.reservationNumber}
        guestName={success.guestName}
        onCreateAnother={() => {
          setSuccess(null);
          setError(null);
          setValidationErrors([]);
        }}
      />
    );
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 border-b border-slate-800 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">{isWalkInMode ? 'Walk-In Booking' : 'Public Reservation Form'}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{isWalkInMode ? 'Create a walk-in reservation' : 'Request a stay at La Velleza Resort'}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {isWalkInMode
                ? 'Create a reservation directly from the front desk using the same booking workflow.'
                : 'No account is required. Submit your request and our staff will review and contact you.'}
            </p>
          </div>
          {isWalkInMode && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      {walkInSuccessMessage ? (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{walkInSuccessMessage}</div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>
      ) : null}

      {validationErrors.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <p className="font-semibold">Please fix the following:</p>
          <ul className="mt-2 list-disc pl-5">
            {validationErrors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <input
            value={form.guestName}
            onChange={(event) => updateField('guestName', event.target.value)}
            placeholder="Guest Full Name"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            required
          />
          <input
            type="email"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
            placeholder="Email Address"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            required
          />
          <input
            value={form.phone}
            onChange={(event) => updateField('phone', event.target.value)}
            placeholder="Mobile Number"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            required
          />
          <input
            value={form.address}
            onChange={(event) => updateField('address', event.target.value)}
            placeholder="Address (optional)"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
          <select
            value={form.room}
            onChange={(event) => updateField('room', event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            required
          >
            <option value="">Select Room</option>
            {rooms.map((room) => (
              <option key={room._id} value={room._id}>
                {room.name} ({room.code})
              </option>
            ))}
          </select>
          <select
            value={form.promo}
            onChange={(event) => updateField('promo', event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            disabled={!form.room || !form.checkIn || !form.checkOut || promoLoading}
          >
            <option value="">Optional Promo ({promoLoading ? 'Loading...' : `${displayedPromoSummary.eligiblePromos} eligible`})</option>
            {displayedEligiblePromos.map((promo) => (
              <option key={promo._id} value={promo._id}>
                {promo.name} ({promo.code})
              </option>
            ))}
          </select>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Check-In Date</label>
            <input
              type="date"
              min={todayMinDate}
              value={form.checkIn}
              onChange={(event) => updateField('checkIn', event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Check-Out Date</label>
            <input
              type="date"
              min={form.checkIn || todayMinDate}
              value={form.checkOut}
              onChange={(event) => updateField('checkOut', event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Adults</label>
            <input
              type="number"
              min={1}
              value={form.adults}
              onChange={(event) => updateField('adults', event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Children</label>
            <input
              type="number"
              min={0}
              value={form.children}
              onChange={(event) => updateField('children', event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              required
            />
          </div>
          {isWalkInMode ? (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Reservation Status</label>
              <select
                value={walkInStatus}
                onChange={(event) => setWalkInStatus(event.target.value === 'CHECKED_IN' ? 'CHECKED_IN' : 'CONFIRMED')}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              >
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="CHECKED_IN">CHECKED_IN</option>
              </select>
            </div>
          ) : null}

          {!isWalkInMode ? (
            <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Payment Option</p>
              <p className="mt-1 text-xs text-slate-400">No online gateway is used. GCash submissions are manually verified by staff.</p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Payment Method</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(event) => {
                      const nextMethod = event.target.value === 'GCASH' ? 'GCASH' : 'CASH_ON_ARRIVAL';
                      updateField('paymentMethod', nextMethod);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  >
                    <option value="CASH_ON_ARRIVAL">Cash on Arrival</option>
                    <option value="GCASH">GCash</option>
                  </select>
                </div>

                {form.paymentMethod === 'GCASH' ? (
                  <>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">GCash Amount Paid</label>
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={form.gcashAmountPaid}
                        onChange={(event) => updateField('gcashAmountPaid', event.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">GCash Reference Number</label>
                      <input
                        value={form.gcashReferenceNumber}
                        onChange={(event) => updateField('gcashReferenceNumber', event.target.value)}
                        placeholder="Enter transaction reference"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Proof of Payment URL (optional)</label>
                      <input
                        value={form.gcashProofOfPaymentUrl}
                        onChange={(event) => updateField('gcashProofOfPaymentUrl', event.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <textarea
          value={form.specialRequests}
          onChange={(event) => updateField('specialRequests', event.target.value)}
          placeholder="Special Requests"
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />

        <button
          type="submit"
          disabled={submitting || rooms.length === 0}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
        >
          {submitting ? (isWalkInMode ? 'Creating Walk-In Booking...' : 'Submitting Request...') : (isWalkInMode ? 'Create Walk-In Booking' : 'Submit Reservation Request')}
        </button>

        {rooms.length === 0 ? (
          <p className="text-xs text-amber-300">No rooms are currently available for reservation requests.</p>
        ) : null}

        <p className="text-xs text-slate-400">
          Promo status scan: {displayedPromoSummary.validPromos} valid, {displayedPromoSummary.expiredPromos} expired, {displayedPromoSummary.inactivePromos} inactive. Only eligible promos are selectable.
        </p>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Pricing Summary</p>
          {pricingLoading ? (
            <p className="mt-2 text-sm text-slate-400">Calculating...</p>
          ) : canComputePricing && pricingSummary ? (
            <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <p>Room Rate ({pricingSummary.numberOfNights} night{pricingSummary.numberOfNights === 1 ? '' : 's'}): <span className="text-white">PHP {pricingSummary.roomRate.toFixed(2)}</span></p>
              <p>Extra Person Fee: <span className="text-white">PHP {pricingSummary.extraPersonFee.toFixed(2)}</span></p>
              <p>Extra Bed Fee: <span className="text-white">PHP {pricingSummary.extraBedFee.toFixed(2)}</span></p>
              <p>Promo Discount: <span className="text-emerald-300">- PHP {pricingSummary.promoDiscount.toFixed(2)}</span></p>
              <p>Additional Room Discount: <span className="text-emerald-300">- PHP {pricingSummary.additionalRoomDiscount.toFixed(2)}</span></p>
              <p>Subtotal: <span className="text-white">PHP {pricingSummary.subtotal.toFixed(2)}</span></p>
              <p className="sm:col-span-2 text-base font-semibold">Grand Total: <span className="text-emerald-300">PHP {pricingSummary.grandTotal.toFixed(2)}</span></p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Select room and stay details to view total pricing.</p>
          )}

          {selectedPromoDetails && selectedPromoDetails.inclusions && selectedPromoDetails.inclusions.length > 0 ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400">Promo Inclusions</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {selectedPromoDetails.inclusions.map((inclusion, index) => (
                  <li key={inclusion._id || `${selectedPromoDetails._id}-${index}`}>
                    {(inclusion.quantity && inclusion.quantity > 1 ? `${inclusion.quantity}x ` : '') + (inclusion.name || 'Inclusion')}
                    {inclusion.description ? ` - ${inclusion.description}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </form>
    </section>
  );
}
