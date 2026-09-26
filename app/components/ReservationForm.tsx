'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ReservationSuccess from '@/app/components/ReservationSuccess';
import { theme } from '@/app/lib/landingTheme';

type RoomOption = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  maxGuests?: number;
  nightlyRate?: number;
  halfDayRate?: number;
  wholeDayRate?: number;
};

type AddOnOption = {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  stockQuantity?: number | null;
  availableQuantity?: number | null;
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
  includedRoomIds?: string[];
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
  promoPackagePrice: number;
  promoDiscount: number;
  additionalRoomDiscount: number;
  roomBreakdown?: Array<{
    roomId: string;
    roomName: string;
    adults: number;
    children: number;
    roomRate: number;
    packageRoom: boolean;
    additionalRoomDiscount: number;
    extraPersonFee: number;
    extraBedFee: number;
  }>;
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

const formatPeso = (value: number) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0));

function resolvePromoRoomId(promo: PromoOption, selectedRoomIds: string[], rooms: RoomOption[]) {
  const includedRoomIds = promo.includedRoomIds || [];
  const isEligibleRoom = (roomId: string) => includedRoomIds.length === 0 || includedRoomIds.includes(roomId);
  return selectedRoomIds.find(isEligibleRoom) || rooms.find((room) => isEligibleRoom(room._id))?._id || null;
}

type FormState = {
  guestName: string;
  email: string;
  phone: string;
  address: string;
  rooms: string[];
  roomGuests: Record<string, { adults: string; children: string }>;
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
    rooms: [],
    roomGuests: {},
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
      rooms: room ? [room] : [],
      roomGuests: room ? { [room]: { adults: '1', children: '0' } } : {},
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
    () => Boolean(form.rooms.length > 0 && form.checkIn && form.checkOut && form.rooms.every((roomId) => Number(form.roomGuests[roomId]?.adults) >= 1 && Number(form.roomGuests[roomId]?.children) >= 0)),
    [form.rooms, form.roomGuests, form.checkIn, form.checkOut]
  );

  const selectedPromoDetails = useMemo(
    () => (form.checkIn && form.checkOut ? eligiblePromos.find((promo) => promo._id === form.promo) || null : null),
    [eligiblePromos, form.promo, form.checkIn, form.checkOut]
  );

  const displayedEligiblePromos = useMemo(
    () => (form.checkIn && form.checkOut ? eligiblePromos : []),
    [eligiblePromos, form.checkIn, form.checkOut]
  );

  const displayedPromoSummary = useMemo(
    () => (form.checkIn && form.checkOut ? promoSummary : emptyPromoSummary),
    [promoSummary, form.checkIn, form.checkOut]
  );

  const selectedRoomDetails = useMemo(
    () => rooms.filter((room) => form.rooms.includes(room._id)),
    [rooms, form.rooms]
  );

  const packageRoomId = useMemo(() => {
    if (!selectedPromoDetails || form.rooms.length === 0) return null;
    const includedRoomIds = selectedPromoDetails.includedRoomIds || [];
    return form.rooms.find((roomId) => includedRoomIds.length === 0 || includedRoomIds.includes(roomId)) || null;
  }, [form.rooms, selectedPromoDetails]);

  const packageIncludesGuests = Boolean(selectedPromoDetails?.includedPax);
  const canChoosePromo = Boolean(form.checkIn && form.checkOut && !promoLoading);

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
      if ((field === 'checkIn' || field === 'checkOut') && current.promo) {
        next.promo = '';
        next.roomGuests = Object.fromEntries(current.rooms.map((roomId) => [roomId, { adults: '1', children: '0' }]));
        next.adults = String(current.rooms.length);
        next.children = '0';
      }
      if (field === 'promo') {
        const selectedPromo = eligiblePromos.find((promo) => promo._id === value);
        if (selectedPromo?.includedPax) {
          const includedRoomIds = selectedPromo.includedRoomIds || [];
          const selectedPackageRoom = current.rooms.find((roomId) => includedRoomIds.length === 0 || includedRoomIds.includes(roomId));
          next.roomGuests = { ...current.roomGuests };
          if (selectedPackageRoom) {
            next.roomGuests[selectedPackageRoom] = { adults: String(selectedPromo.includedPax), children: '0' };
          }
        } else if (!value) {
          next.roomGuests = Object.fromEntries(current.rooms.map((roomId) => [roomId, { adults: '1', children: '0' }]));
        }
      }
      if (field === 'promo' || field === 'roomGuests') {
        next.adults = String(Object.values(next.roomGuests).reduce((total, guests) => total + (Number(guests.adults) || 0), 0));
        next.children = String(Object.values(next.roomGuests).reduce((total, guests) => total + (Number(guests.children) || 0), 0));
      }
      return next;
    });
  };

  const toggleRoomSelection = (roomId: string) => {
    setForm((current) => {
      const selected = current.rooms.includes(roomId);
      const nextRooms = selected ? current.rooms.filter((id) => id !== roomId) : [...current.rooms, roomId];
      const nextRoomGuests = { ...current.roomGuests };
      if (selected) {
        delete nextRoomGuests[roomId];
      } else {
        const selectedPromo = eligiblePromos.find((promo) => promo._id === current.promo);
        const includedRoomIds = selectedPromo?.includedRoomIds || [];
        const isPackageRoom = Boolean(selectedPromo?.includedPax)
          && (includedRoomIds.length === 0 || includedRoomIds.includes(roomId))
          && !nextRooms.some((id) => includedRoomIds.length === 0 || includedRoomIds.includes(id));
        nextRoomGuests[roomId] = {
          adults: isPackageRoom ? String(selectedPromo?.includedPax) : '1',
          children: '0',
        };
      }
      const selectedPromo = eligiblePromos.find((promo) => promo._id === current.promo);
      const includedRoomIds = selectedPromo?.includedRoomIds || [];
      const nextPackageRoom = nextRooms.find((id) => includedRoomIds.length === 0 || includedRoomIds.includes(id));
      if (selectedPromo?.includedPax && nextPackageRoom) {
        nextRoomGuests[nextPackageRoom] = { adults: String(selectedPromo.includedPax), children: '0' };
      }
      return {
        ...current,
        rooms: nextRooms,
        roomGuests: nextRoomGuests,
        adults: String(Object.values(nextRoomGuests).reduce((total, guests) => total + (Number(guests.adults) || 0), 0)),
        children: String(Object.values(nextRoomGuests).reduce((total, guests) => total + (Number(guests.children) || 0), 0)),
      };
    });
  };

  const updateRoomGuests = (roomId: string, field: 'adults' | 'children', value: string) => {
    setForm((current) => {
      const roomGuests = {
        ...current.roomGuests,
        [roomId]: { ...current.roomGuests[roomId], [field]: value },
      };
      return {
        ...current,
        roomGuests,
        adults: String(Object.values(roomGuests).reduce((total, guests) => total + (Number(guests.adults) || 0), 0)),
        children: String(Object.values(roomGuests).reduce((total, guests) => total + (Number(guests.children) || 0), 0)),
      };
    });
  };

  const selectPromo = (promo: PromoOption) => {
    const promoRoomId = resolvePromoRoomId(promo, form.rooms, rooms);
    if (!promoRoomId) {
      setError('No available rooms can use this promo package.');
      return;
    }

    setError(null);
    setForm((current) => {
      const selectedRoomId = resolvePromoRoomId(promo, current.rooms, rooms) || promoRoomId;
      const nextRooms = current.rooms.includes(selectedRoomId) ? current.rooms : [...current.rooms, selectedRoomId];
      const roomGuests = {
        ...current.roomGuests,
        [selectedRoomId]: current.roomGuests[selectedRoomId] || { adults: '1', children: '0' },
      };
      if (promo.includedPax) {
        roomGuests[selectedRoomId] = { adults: String(promo.includedPax), children: '0' };
      }
      return {
        ...current,
        promo: promo._id,
        rooms: nextRooms,
        roomGuests,
        adults: String(Object.values(roomGuests).reduce((total, guests) => total + (Number(guests.adults) || 0), 0)),
        children: String(Object.values(roomGuests).reduce((total, guests) => total + (Number(guests.children) || 0), 0)),
      };
    });
    setSelectionPicker(null);
  };

  const validate = () => {
    const errors: string[] = [];

    if (!form.guestName.trim()) errors.push('Guest full name is required.');
    if (!form.email.trim()) errors.push('Email address is required.');
    if (!form.phone.trim()) errors.push('Mobile number is required.');
    if (form.rooms.length === 0) errors.push('Select at least one room.');
    if (!form.checkIn) errors.push('Check-in date is required.');
    if (!form.checkOut) errors.push('Check-out date is required.');

    form.rooms.forEach((roomId) => {
      const guests = form.roomGuests[roomId];
      if (!Number.isFinite(Number(guests?.adults)) || Number(guests?.adults) < 1) errors.push('Adults for each room must be at least 1.');
      if (!Number.isFinite(Number(guests?.children)) || Number(guests?.children) < 0) errors.push('Children for each room cannot be negative.');
    });

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
          room: form.rooms[0],
          roomAssignments: form.rooms.map((roomId) => ({
            room: roomId,
            adults: Number(form.roomGuests[roomId]?.adults || 0),
            children: Number(form.roomGuests[roomId]?.children || 0),
          })),
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
        const query = new URLSearchParams({ checkIn: form.checkIn, checkOut: form.checkOut });
        const response = await fetch(`/api/add-ons?${query.toString()}`);
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data)) {
          if (!cancelled) setAvailableAddOns([]);
          return;
        }
        if (!cancelled) {
          const addOns = data as AddOnOption[];
          setAvailableAddOns(addOns);
          setForm((current) => {
            const quantities = { ...current.addOns };
            addOns.forEach((addOn) => {
              const available = addOn.availableQuantity;
              if (available !== null && available !== undefined && (quantities[addOn._id] || 0) > available) {
                quantities[addOn._id] = available;
              }
            });
            return { ...current, addOns: quantities };
          });
        }
      } finally {
        if (!cancelled) setAddOnsLoading(false);
      }
    };

    void loadAddOns();
    return () => {
      cancelled = true;
    };
  }, [form.checkIn, form.checkOut]);

  useEffect(() => {
    let cancelled = false;
    if (!form.checkIn || !form.checkOut) {
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = window.setTimeout(async () => {
      setPromoLoading(true);
      try {
        const queryParams = new URLSearchParams({
          checkIn: form.checkIn,
          checkOut: form.checkOut,
        });
        form.rooms.forEach((roomId) => queryParams.append('room', roomId));

        const response = await fetch(`/api/reservations/promos?${queryParams.toString()}`);
        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.success) {
          if (!cancelled) {
            setEligiblePromos([]);
            setPromoSummary(emptyPromoSummary);
          }
          return;
        }

        const nextPromos = Array.isArray(data.eligiblePromos) ? data.eligiblePromos as PromoOption[] : [];
        if (cancelled) return;
        setEligiblePromos(nextPromos);
        const prefilledPromo = nextPromos.find((promo) => promo._id === form.promo);
        if (form.promo && !prefilledPromo) {
          setForm((current) => current.promo === form.promo ? {
            ...current,
            promo: '',
            adults: String(Object.values(current.roomGuests).reduce((total, guests) => total + (Number(guests.adults) || 0), 0)),
            children: String(Object.values(current.roomGuests).reduce((total, guests) => total + (Number(guests.children) || 0), 0)),
          } : current);
        }
        if (prefilledPromo) {
          const promoRoomId = resolvePromoRoomId(prefilledPromo, form.rooms, rooms);
          if (promoRoomId) {
            setForm((current) => {
              if (current.promo !== prefilledPromo._id) return current;
              const selectedRoomId = resolvePromoRoomId(prefilledPromo, current.rooms, rooms) || promoRoomId;
              const nextRooms = current.rooms.includes(selectedRoomId) ? current.rooms : [...current.rooms, selectedRoomId];
              const roomGuests = {
                ...current.roomGuests,
                [selectedRoomId]: current.roomGuests[selectedRoomId] || { adults: '1', children: '0' },
              };
              if (prefilledPromo.includedPax) {
                roomGuests[selectedRoomId] = { adults: String(prefilledPromo.includedPax), children: '0' };
              }
              return {
                ...current,
                rooms: nextRooms,
                roomGuests,
                adults: String(Object.values(roomGuests).reduce((total, guests) => total + (Number(guests.adults) || 0), 0)),
                children: String(Object.values(roomGuests).reduce((total, guests) => total + (Number(guests.children) || 0), 0)),
              };
            });
          } else {
            setError('No available rooms can use this promo package.');
          }
        }
        setPromoSummary({
          validPromos: Number(data?.summary?.validPromos || 0),
          expiredPromos: Number(data?.summary?.expiredPromos || 0),
          inactivePromos: Number(data?.summary?.inactivePromos || 0),
          eligiblePromos: Number(data?.summary?.eligiblePromos || 0),
        });

      } catch {
        if (!cancelled) {
          setEligiblePromos([]);
          setPromoSummary(emptyPromoSummary);
        }
      } finally {
        if (!cancelled) setPromoLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.rooms, form.promo, form.checkIn, form.checkOut, rooms]);

  useEffect(() => {
    if (!canComputePricing) return;

    const timeoutId = window.setTimeout(async () => {
      setPricingLoading(true);
      try {
        const response = await fetch('/api/reservations/pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: form.rooms[0],
            roomAssignments: form.rooms.map((roomId) => ({
              room: roomId,
              adults: Number(form.roomGuests[roomId]?.adults || 0),
              children: Number(form.roomGuests[roomId]?.children || 0),
            })),
            promo: form.promo || null,
            checkIn: form.checkIn,
            checkOut: form.checkOut,
            adults: Number(form.adults),
            children: Number(form.children),
            reservationStatus: isWalkInMode ? walkInStatus : 'PENDING',
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
  }, [canComputePricing, form.rooms, form.roomGuests, form.promo, form.checkIn, form.checkOut, form.adults, form.children, form.addOns, isWalkInMode, walkInStatus]);

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
          <p className="mt-1 text-xs" style={{ color: `${theme.ink}99` }}>Choose one or more rooms for the same stay. Select a package after choosing your stay dates.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3 sm:col-span-2" style={{ borderColor: `${theme.ink}1A`, backgroundColor: `${theme.sand}CC` }}>
            <div className="grid gap-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: `${theme.ink}80` }}>Selected rooms</p>
                {selectedRoomDetails.length > 0 ? selectedRoomDetails.map((room) => (
                  <div key={room._id} className="mt-2">
                    <p className="text-sm font-semibold" style={{ color: theme.navy }}>{room.name}</p>
                    <p className="text-xs" style={{ color: `${theme.ink}99` }}>{room.code}</p>
                  </div>
                )) : <p className="mt-2 text-sm font-semibold" style={{ color: theme.navy }}>No rooms selected</p>}
                <button
                  type="button"
                  onClick={() => setSelectionPicker('room')}
                  className="mt-4 rounded-lg border px-3 py-2 text-xs font-semibold transition hover:bg-black/5" style={{ borderColor: `${theme.royal}55`, color: theme.royal }}
                >
                  View &amp; change room
                </button>
              </div>
              {selectedRoomDetails.length > 0 ? (
                <div className="space-y-2 border-t pt-4 text-sm md:border-l md:border-t-0 md:pl-7 md:pt-0" style={{ borderColor: `${theme.ink}1A` }}>
                  {selectedRoomDetails.map((room) => (
                    <div key={room._id} className="grid grid-cols-2 gap-2 rounded-lg border p-2" style={{ borderColor: `${theme.ink}1A` }}>
                      <p className="col-span-2 text-xs font-semibold" style={{ color: theme.navy }}>{room.name}</p>
                      <p className="text-[10px]" style={{ color: `${theme.ink}80` }}>Capacity: {room.maxGuests || '—'}</p>
                      <p className="text-[10px]" style={{ color: `${theme.ink}80` }}>Night: {formatPeso(Number(room.nightlyRate || 0))}</p>
                      <p className="text-[10px]" style={{ color: `${theme.ink}80` }}>Half day: {formatPeso(Number(room.halfDayRate || 0))}</p>
                      <p className="text-[10px]" style={{ color: `${theme.ink}80` }}>Whole day: {formatPeso(Number(room.wholeDayRate || 0))}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center border-t pt-4 text-xs md:border-l md:border-t-0 md:pl-7 md:pt-0" style={{ borderColor: `${theme.ink}1A`, color: `${theme.ink}99` }}>
                  Room details will appear here after you make a selection.
                </div>
              )}
            </div>
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
            <div className="grid gap-7 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected promo package</p>
                <p className="mt-2 text-sm font-semibold text-white">{selectedPromoDetails ? selectedPromoDetails.name : 'No promo selected'}</p>
                {selectedPromoDetails ? (
                  <p className="mt-1 text-xs text-slate-400">{selectedPromoDetails.code}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectionPicker('promo')}
                  disabled={!canChoosePromo}
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold transition ${canChoosePromo ? 'border-[#2E5AA8]/40 bg-[#2E5AA8]/10 text-[#1F3A5F] hover:bg-[#2E5AA8]/20' : 'cursor-not-allowed border-slate-700/30 text-slate-400 opacity-60'}`}
                >
                  {promoLoading ? 'Loading packages...' : 'View & change package'}
                </button>
                {!form.checkIn || !form.checkOut ? (
                  <p className="mt-2 text-xs text-slate-500">Select both stay dates to view available packages.</p>
                ) : null}
              </div>
              {selectedPromoDetails ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-800 pt-4 text-sm md:border-l md:border-t-0 md:pl-7 md:pt-0">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Package price</p>
                    <p className="mt-1 font-semibold text-[#E85C3E]">{formatPeso(selectedPromoDetails.packagePrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Included guests</p>
                    <p className="mt-1 font-semibold text-[#2E5AA8]">{selectedPromoDetails.includedPax || 'Flexible'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Package inclusions</p>
                    {selectedPromoDetails.inclusions && selectedPromoDetails.inclusions.length > 0 ? (
                      <ul className="mt-1 grid gap-x-5 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
                        {selectedPromoDetails.inclusions.map((inclusion, index) => (
                          <li key={inclusion._id || `${selectedPromoDetails._id}-summary-${index}`}>
                            <span className="mr-1 text-[#E85C3E]">•</span>
                            {inclusion.quantity && inclusion.quantity > 1 ? `${inclusion.quantity}x ` : ''}
                            {inclusion.name || 'Included item'}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">No inclusions listed.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center border-t border-slate-800 pt-4 text-xs text-slate-500 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                  Package details will appear here after you make a selection.
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-2 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Guests per room</p>
            {selectedRoomDetails.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-500">Select rooms to assign guests.</p>
            ) : selectedRoomDetails.map((room) => {
              const isPackageRoom = packageRoomId === room._id && packageIncludesGuests;
              const guests = form.roomGuests[room._id] || { adults: '1', children: '0' };
              return (
                <div key={room._id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{room.name} · {room.code}</p>
                    {isPackageRoom ? <span className="text-xs text-emerald-300">Promo package room</span> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-slate-400">Adults
                      <input
                        type="number"
                        min={1}
                        value={guests.adults}
                        disabled={isPackageRoom}
                        onChange={(event) => updateRoomGuests(room._id, 'adults', event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
                        required
                      />
                    </label>
                    <label className="text-xs text-slate-400">Children
                      <input
                        type="number"
                        min={0}
                        value={guests.children}
                        disabled={isPackageRoom}
                        onChange={(event) => updateRoomGuests(room._id, 'children', event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
                        required
                      />
                    </label>
                  </div>
                  {isPackageRoom ? <p className="mt-2 text-xs text-slate-500">This promo includes {selectedPromoDetails?.includedPax} guests in this room.</p> : null}
                </div>
              );
            })}
          </div>
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
                        <p className="text-xs text-slate-400">{formatPeso(Number(addOn.price || 0))}{addOn.availableQuantity !== null && addOn.availableQuantity !== undefined ? ` · ${addOn.availableQuantity} available for these dates` : ''}</p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={addOn.availableQuantity ?? undefined}
                        disabled={addOn.availableQuantity === 0}
                        value={quantity}
                        onChange={(event) => setForm((current) => ({ ...current, addOns: { ...current.addOns, [addOn._id]: Math.min(addOn.availableQuantity ?? Number.MAX_SAFE_INTEGER, Math.max(0, Number(event.target.value) || 0)) } }))}
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
              {pricingSummary.promoPackagePrice > 0 ? null : <p>Room Rate ({pricingSummary.numberOfNights} night{pricingSummary.numberOfNights === 1 ? '' : 's'}): <span className="text-white">{formatPeso(pricingSummary.roomRate)}</span></p>}
              {pricingSummary.promoPackagePrice > 0 ? <p>Package Price: <span className="text-white">{formatPeso(pricingSummary.promoPackagePrice)}</span></p> : null}
              <p>Extra Person Fee: <span className="text-white">{formatPeso(pricingSummary.extraPersonFee)}</span></p>
              <p>Extra Bed Fee: <span className="text-white">{formatPeso(pricingSummary.extraBedFee)}</span></p>
              <p>Add-On Total: <span className="text-white">{formatPeso(pricingSummary.addOnTotal)}</span></p>
              {pricingSummary.promoPackagePrice > 0 ? null : <p>Promo Discount: <span className="text-emerald-300">- {formatPeso(pricingSummary.promoDiscount)}</span></p>}
              {pricingSummary.promoPackagePrice > 0 ? null : <p>Additional Room Discount: <span className="text-emerald-300">- {formatPeso(pricingSummary.additionalRoomDiscount)}</span></p>}
              <p>Subtotal: <span className="text-white">{formatPeso(pricingSummary.subtotal)}</span></p>
              <p className="sm:col-span-2 text-base font-semibold">Grand Total: <span className="text-emerald-300">{formatPeso(pricingSummary.grandTotal)}</span></p>
              {pricingSummary.roomBreakdown && pricingSummary.roomBreakdown.length > 1 ? (
                <div className="sm:col-span-2 border-t border-white/10 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Room breakdown</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-300">
                    {pricingSummary.roomBreakdown.map((room) => (
                      <li key={room.roomId} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                        <span>{room.roomName} · {room.adults} adult{room.adults === 1 ? '' : 's'}, {room.children} child{room.children === 1 ? '' : 'ren'}{room.packageRoom ? ' · Package' : ''}</span>
                        <span>{room.packageRoom ? formatPeso(pricingSummary.promoPackagePrice) : formatPeso(room.roomRate)}{room.additionalRoomDiscount > 0 ? ` · −${formatPeso(room.additionalRoomDiscount)}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
                {pricingSummary.addOns.map((addOn) => <li key={addOn.addOnId}>{addOn.quantity}x {addOn.name} - {formatPeso(addOn.totalPrice)}</li>)}
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
          disabled={submitting || rooms.length === 0 || form.rooms.length === 0}
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
          className="fixed inset-0 z-60 flex items-center justify-center p-4"
          style={{ backgroundColor: `${theme.navy}CC` }}
          onClick={() => setSelectionPicker(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border p-5 shadow-2xl"
            style={{ backgroundColor: theme.sand, borderColor: `${theme.ink}26`, boxShadow: `0 24px 60px ${theme.navy}55` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Reservation selection</p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {selectionPicker === 'room' ? 'Select rooms' : 'Choose a promo package'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectionPicker(null)}
                aria-label="Close selection dialog"
                className="flex h-8 w-8 items-center justify-center rounded-full border text-lg transition hover:bg-black/5"
                style={{ borderColor: `${theme.ink}33`, color: theme.navy }}
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-2">
              {selectionPicker === 'room' && form.rooms.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setForm((current) => ({ ...current, rooms: [], roomGuests: {}, adults: '0', children: '0', promo: '' }));
                    setSelectionPicker(null);
                  }}
                  className="w-full rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-500/10"
                >
                  Clear selected rooms
                </button>
              ) : null}
              {selectionPicker === 'promo' && form.promo ? (
                <button
                  type="button"
                  onClick={() => {
                    updateField('promo', '');
                    setSelectionPicker(null);
                  }}
                  className="w-full rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-500/10"
                >
                  Clear selected promo
                </button>
              ) : null}
              {selectionPicker === 'room' ? rooms.map((room) => (
                <button
                  key={room._id}
                  type="button"
                  onClick={() => toggleRoomSelection(room._id)}
                  aria-pressed={form.rooms.includes(room._id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${form.rooms.includes(room._id) ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">{room.name}</span>
                    <span className="mt-1 block text-xs text-slate-400">{room.code}</span>
                  </span>
                  {form.rooms.includes(room._id) ? <span className="text-xs font-semibold text-emerald-300">Selected</span> : null}
                </button>
              )) : displayedEligiblePromos.map((promo) => (
                <button
                  key={promo._id}
                  type="button"
                  onClick={() => {
                    selectPromo(promo);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${form.promo === promo._id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">{promo.name}</span>
                    <span className="mt-1 block text-xs text-slate-400">{promo.code} · {formatPeso(promo.packagePrice)}{promo.includedPax ? ` · Good for ${promo.includedPax}` : ''}</span>
                  </span>
                  {form.promo === promo._id ? <span className="shrink-0 text-xs font-semibold text-emerald-300">Selected</span> : null}
                </button>
              ))}
              {selectionPicker === 'room' && rooms.length === 0 ? <p className="py-5 text-center text-sm text-slate-400">No rooms are currently available.</p> : null}
              {selectionPicker === 'promo' && displayedEligiblePromos.length === 0 ? <p className="py-5 text-center text-sm text-slate-400">{form.rooms.length > 0 ? 'No eligible promo packages are available for these rooms and dates.' : 'No available promo packages match these dates.'}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
