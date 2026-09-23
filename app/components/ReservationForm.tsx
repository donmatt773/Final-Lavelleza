'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ReservationSuccess from '@/app/components/ReservationSuccess';
import { theme } from '@/app/lib/landingTheme';

type RoomOption = {
  _id: string;
  name: string;
  code: string;
};

type AddOnOption = {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  stockQuantity?: number | null;
};

type PromoOption = {
  _id: string;
  name: string;
  code: string;
  packagePrice: number;
  includedPax?: number;
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
  addOnTotal: number;
  addOns: Array<{
    addOnId: string;
    quantity: number;
    name: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  promoDiscount: number;
  additionalRoomDiscount: number;
  subtotal: number;
  grandTotal: number;
};

type Props = {
  rooms: RoomOption[];
  initialSelection?: {
    room?: string;
    promo?: string;
    checkIn?: string;
    checkOut?: string;
  };
  mode?: 'public' | 'walk-in';
  onSuccess?: (reservationNumber: string) => void;
  onCancel?: () => void;
};

type SelectionPicker = 'room' | 'promo' | null;

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
  addOns: Record<string, number>;
};

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createInitialForm(): FormState {
  const checkIn = new Date();
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 1);

  return {
    guestName: '',
    email: '',
    phone: '',
    address: '',
    room: '',
    promo: '',
    checkIn: formatDateInput(checkIn),
    checkOut: formatDateInput(checkOut),
    adults: '1',
    children: '0',
    paymentMethod: 'CASH_ON_ARRIVAL',
    gcashAmountPaid: '',
    gcashReferenceNumber: '',
    gcashProofOfPaymentUrl: '',
    specialRequests: '',
    addOns: {},
  };
}

const emptyPromoSummary = { validPromos: 0, expiredPromos: 0, inactivePromos: 0, eligiblePromos: 0 };

export default function ReservationForm({ rooms, initialSelection, mode = 'public', onSuccess, onCancel }: Props) {
  const isWalkInMode = mode === 'walk-in';
  const [form, setForm] = useState<FormState>(() => {
    const defaults = createInitialForm();
    if (isWalkInMode || rooms.length === 0 || !initialSelection) return defaults;

    const requestedRoom = initialSelection.room || '';
    const room = rooms.some((option) => option._id === requestedRoom) ? requestedRoom : '';

    return {
      ...defaults,
      room,
      promo: initialSelection.promo || '',
      checkIn: initialSelection.checkIn || defaults.checkIn,
      checkOut: initialSelection.checkOut || defaults.checkOut,
    };
  });
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
  const [availableAddOns, setAvailableAddOns] = useState<AddOnOption[]>([]);
  const [addOnsLoading, setAddOnsLoading] = useState(false);
  const [selectionPicker, setSelectionPicker] = useState<SelectionPicker>(null);

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

  const selectedRoomDetails = useMemo(
    () => rooms.find((room) => room._id === form.room) || null,
    [rooms, form.room]
  );

  const packageIncludesGuests = Boolean(selectedPromoDetails?.includedPax);

  useEffect(() => {
    if (!selectionPicker) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectionPicker(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionPicker]);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if ((field === 'room' || field === 'checkIn' || field === 'checkOut') && current.promo) {
        next.promo = '';
        next.adults = '1';
        next.children = '0';
      }
      if (field === 'promo') {
        const selectedPromo = eligiblePromos.find((promo) => promo._id === value);
        if (selectedPromo?.includedPax) {
          next.adults = String(selectedPromo.includedPax);
          next.children = '0';
        } else if (!value) {
          next.adults = '1';
          next.children = '0';
        }
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
          addOns: Object.entries(form.addOns).filter(([, quantity]) => quantity > 0).map(([addOnId, quantity]) => ({ addOnId, quantity })),
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

      setForm(createInitialForm());
      setValidationErrors([]);
      setPricingSummary(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit reservation request.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadAddOns = async () => {
      setAddOnsLoading(true);
      try {
        const response = await fetch('/api/add-ons');
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data)) return;
        if (!cancelled) setAvailableAddOns(data as AddOnOption[]);
      } finally {
        if (!cancelled) setAddOnsLoading(false);
      }
    };

    void loadAddOns();
    return () => {
      cancelled = true;
    };
  }, []);

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
        const prefilledPromo = nextPromos.find((promo) => promo._id === form.promo);
        if (prefilledPromo?.includedPax) {
          setForm((current) => ({ ...current, adults: String(prefilledPromo.includedPax), children: '0' }));
        }
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
  }, [form.room, form.promo, form.checkIn, form.checkOut]);

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
            addOns: Object.entries(form.addOns).filter(([, quantity]) => quantity > 0).map(([addOnId, quantity]) => ({ addOnId, quantity })),
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
  }, [canComputePricing, form.room, form.promo, form.checkIn, form.checkOut, form.adults, form.children, form.addOns]);

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
    <section className="reservation-form rounded-3xl border p-4 shadow-xl sm:p-6 lg:p-8" style={{ borderColor: `${theme.ink}1A`, backgroundColor: '#FFFDF8', boxShadow: `0 20px 50px ${theme.ink}12` }}>
      <div className="mb-6 border-b pb-6" style={{ borderColor: `${theme.ink}1A` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.coral }}>{isWalkInMode ? 'Walk-In Booking' : 'Public Reservation Form'}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: theme.navy }}>{isWalkInMode ? 'Create a walk-in reservation' : 'Request a stay at La Velleza Resort'}</h2>
            <p className="mt-2 text-sm" style={{ color: `${theme.ink}99` }}>
              {isWalkInMode
                ? 'Create a reservation directly from the front desk using the same booking workflow.'
                : 'No account is required. Submit your request and our staff will review and contact you.'}
            </p>
          </div>
          {isWalkInMode && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border px-3 py-2 text-xs transition hover:bg-black/5" style={{ borderColor: `${theme.ink}33`, color: theme.ink }}
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

      <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: `${theme.royal}33`, backgroundColor: `${theme.royal}0D` }}>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: theme.royal }}>Stay selection</p>
          <p className="mt-1 text-xs" style={{ color: `${theme.ink}99` }}>Choose your room before entering guest details. Select a package after choosing your stay dates.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3" style={{ borderColor: `${theme.ink}1A`, backgroundColor: `${theme.sand}CC` }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: `${theme.ink}80` }}>Selected room</p>
            <p className="mt-2 text-sm font-semibold" style={{ color: theme.navy }}>{selectedRoomDetails ? selectedRoomDetails.name : 'No room selected'}</p>
            {selectedRoomDetails ? <p className="mt-1 text-xs" style={{ color: `${theme.ink}99` }}>{selectedRoomDetails.code}</p> : null}
            <button
              type="button"
              onClick={() => setSelectionPicker('room')}
              className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold transition hover:bg-black/5" style={{ borderColor: `${theme.royal}55`, color: theme.royal }}
            >
              View &amp; change room
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Guest details</p>
              <p className="mt-1 text-xs text-slate-500">Tell us who will be staying with us.</p>
            </div>
            <span className="text-xs text-slate-500">Required fields marked by the form</span>
          </div>
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
          <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected promo package</p>
            <p className="mt-2 text-sm font-semibold text-white">{selectedPromoDetails ? selectedPromoDetails.name : 'No promo selected'}</p>
            {selectedPromoDetails ? (
              <p className="mt-1 text-xs text-slate-400">
                {selectedPromoDetails.code} · PHP {selectedPromoDetails.packagePrice.toFixed(2)}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setSelectionPicker('promo')}
              disabled={!form.room || !form.checkIn || !form.checkOut || promoLoading}
              className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {promoLoading ? 'Loading packages...' : 'View & change package'}
            </button>
            {!form.room || !form.checkIn || !form.checkOut ? (
              <p className="mt-2 text-xs text-slate-500">Select a room and both stay dates to view eligible packages.</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Adults{packageIncludesGuests ? ' (package)' : ''}</label>
            <input
              type="number"
              min={1}
              value={form.adults}
              disabled={packageIncludesGuests}
              onChange={(event) => updateField('adults', event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-400">Children{packageIncludesGuests ? ' (package)' : ''}</label>
            <input
              type="number"
              min={0}
              value={form.children}
              disabled={packageIncludesGuests}
              onChange={(event) => updateField('children', event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
              required
            />
          </div>
          {packageIncludesGuests ? (
            <p className="md:col-span-2 text-xs text-slate-500">This package includes {selectedPromoDetails?.includedPax} guests. Guest counts are fixed for this package.</p>
          ) : null}
          <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Additional Items</p>
            <p className="mt-1 text-xs text-slate-400">Optional extras are added to the reservation total.</p>
            {addOnsLoading ? <p className="mt-3 text-sm text-slate-500">Loading additional items...</p> : availableAddOns.length === 0 ? <p className="mt-3 text-sm text-slate-500">No additional items are currently available.</p> : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {availableAddOns.map((addOn) => {
                  const quantity = form.addOns[addOn._id] || 0;
                  return (
                    <div key={addOn._id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-white">{addOn.name}</p>
                        <p className="text-xs text-slate-400">PHP {Number(addOn.price || 0).toFixed(2)}{addOn.stockQuantity !== null && addOn.stockQuantity !== undefined ? ` · ${addOn.stockQuantity} available` : ''}</p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={addOn.stockQuantity ?? undefined}
                        value={quantity}
                        onChange={(event) => setForm((current) => ({ ...current, addOns: { ...current.addOns, [addOn._id]: Math.max(0, Number(event.target.value) || 0) } }))}
                        className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-sm text-white outline-none focus:border-emerald-500"
                        aria-label={`Quantity of ${addOn.name}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
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
        </div>

        <div className="pricing-summary rounded-2xl border border-white/15 bg-linear-to-br from-[#1F3A5F] via-[#2E5AA8] to-[#1F3A5F] p-5 text-sand shadow-lg shadow-[#1F3A5F]/25">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Pricing Summary</p>
          {pricingLoading ? (
            <p className="mt-2 text-sm text-slate-400">Calculating...</p>
          ) : canComputePricing && pricingSummary ? (
            <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <p>Room Rate ({pricingSummary.numberOfNights} night{pricingSummary.numberOfNights === 1 ? '' : 's'}): <span className="text-white">PHP {pricingSummary.roomRate.toFixed(2)}</span></p>
              <p>Extra Person Fee: <span className="text-white">PHP {pricingSummary.extraPersonFee.toFixed(2)}</span></p>
              <p>Extra Bed Fee: <span className="text-white">PHP {pricingSummary.extraBedFee.toFixed(2)}</span></p>
              <p>Add-On Total: <span className="text-white">PHP {pricingSummary.addOnTotal.toFixed(2)}</span></p>
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

          {pricingSummary?.addOns && pricingSummary.addOns.length > 0 ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400">Additional Items</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {pricingSummary.addOns.map((addOn) => <li key={addOn.addOnId}>{addOn.quantity}x {addOn.name} - PHP {addOn.totalPrice.toFixed(2)}</li>)}
              </ul>
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Anything else?</p>
          <textarea
          value={form.specialRequests}
          onChange={(event) => updateField('specialRequests', event.target.value)}
          placeholder="Special Requests"
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || rooms.length === 0}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
        >
          {submitting ? (isWalkInMode ? 'Creating Walk-In Booking...' : 'Submitting Request...') : (isWalkInMode ? 'Create Walk-In Booking' : 'Submit Reservation Request')}
        </button>

        {rooms.length === 0 ? (
          <p className="text-xs text-amber-300">No rooms are currently available for reservation requests.</p>
        ) : null}

        <p className="text-xs text-slate-400">
          Promo status scan: {displayedPromoSummary.validPromos} valid, {displayedPromoSummary.expiredPromos} expired, {displayedPromoSummary.inactivePromos} inactive. Only eligible promos are selectable.
        </p>

      </form>

      {selectionPicker ? (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setSelectionPicker(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Reservation selection</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {selectionPicker === 'room' ? 'Choose a room' : 'Choose a promo package'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectionPicker(null)}
                aria-label="Close selection dialog"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-lg text-slate-300 hover:bg-slate-800"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-2">
              {selectionPicker === 'room' ? rooms.map((room) => (
                <button
                  key={room._id}
                  type="button"
                  onClick={() => {
                    updateField('room', room._id);
                    setSelectionPicker(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${form.room === room._id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">{room.name}</span>
                    <span className="mt-1 block text-xs text-slate-400">{room.code}</span>
                  </span>
                  {form.room === room._id ? <span className="text-xs font-semibold text-emerald-300">Selected</span> : null}
                </button>
              )) : displayedEligiblePromos.map((promo) => (
                <button
                  key={promo._id}
                  type="button"
                  onClick={() => {
                    updateField('promo', promo._id);
                    setSelectionPicker(null);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${form.promo === promo._id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">{promo.name}</span>
                    <span className="mt-1 block text-xs text-slate-400">{promo.code} · PHP {promo.packagePrice.toFixed(2)}{promo.includedPax ? ` · Good for ${promo.includedPax}` : ''}</span>
                  </span>
                  {form.promo === promo._id ? <span className="shrink-0 text-xs font-semibold text-emerald-300">Selected</span> : null}
                </button>
              ))}
              {selectionPicker === 'room' && rooms.length === 0 ? <p className="py-5 text-center text-sm text-slate-400">No rooms are currently available.</p> : null}
              {selectionPicker === 'promo' && displayedEligiblePromos.length === 0 ? <p className="py-5 text-center text-sm text-slate-400">No eligible promo packages are available for this room and date range.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
