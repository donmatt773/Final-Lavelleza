'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import RoomForm from '@/app/components/RoomForm';

type RoomRecord = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  maxGuests: number;
  status: string;
  nightlyRate: number;
  halfDayRate: number;
  wholeDayRate: number;
  beds?: Array<{
    quantity: number;
    bedTypeId?: {
      name?: string;
      slug?: string;
    };
  }>;
  features?: Array<{
    name?: string;
    slug?: string;
  }>;
  amenities?: Array<{
    name?: string;
    slug?: string;
  }>;
  images?: Array<{
    _id?: string;
    fileUrl?: string;
    storageKey?: string;
    altText?: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }>;
  isArchived?: boolean;
  availabilityLabel?: 'AVAILABLE' | 'RESERVED_TODAY' | 'UPCOMING_RESERVATION';
};

type Props = {
  active: boolean;
};

const PAGE_SIZE = 6;

const formatRate = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value);

export default function RoomManagementPanel({ active }: Props) {
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('success');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [selectedRoom, setSelectedRoom] = useState<RoomRecord | null>(null);
  const [viewRoom, setViewRoom] = useState<RoomRecord | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const getAuthHeaders = () => {
    const role = localStorage.getItem('auth_role') || '';
    return {
      'x-user-role': role,
    };
  };

  const loadRooms = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const authHeaders = getAuthHeaders();
      const res = await fetch('/api/rooms', { headers: authHeaders });
      if (!res.ok) {
        throw new Error('Unable to load rooms');
      }
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load rooms');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    const timeoutId = window.setTimeout(() => {
      void loadRooms();
      setPage(1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [active, loadRooms]);

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = rooms;

    if (query) {
      result = result.filter((room) => {
        const featureText = (room.features || []).map((feature) => feature.name || '').join(' ');
        const amenityText = (room.amenities || []).map((amenity) => amenity.name || '').join(' ');
        const haystack = [room.name, room.code, room.description || '', featureText, amenityText]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    if (statusFilter !== 'ALL') {
      result = result.filter((room) => room.status === statusFilter);
    }

    return result;
  }, [rooms, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page <= totalPages) return;

    const timeoutId = window.setTimeout(() => {
      setPage(1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [page, totalPages]);

  const pagedRooms = filteredRooms.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleArchive = async (roomId: string) => {
    setProcessingId(roomId);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: 'INACTIVE', isArchived: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to archive room');
      }
      setRooms((current) =>
        current.filter((room) => room._id !== roomId)
      );
      setMessage('Room archived successfully. It has been removed from the active list.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to archive room');
      setMessageType('error');
    } finally {
      setProcessingId(null);
    }
  };

  const openAddForm = () => {
    setSelectedRoom(null);
    setFormMode('add');
    setFormOpen(true);
  };

  const openEditForm = (room: RoomRecord) => {
    setSelectedRoom(room);
    setFormMode('edit');
    setFormOpen(true);
  };

  const handleSaved = () => {
    loadRooms();
  };

  const handleViewRoom = async (roomId: string) => {
    setViewLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to load room details');
      }
      setViewRoom(data.room || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load room details');
      setMessageType('error');
    } finally {
      setViewLoading(false);
    }
  };

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Room Management</p>
          <h2 className="text-2xl font-semibold text-white">Manage rooms, rates, and availability</h2>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          + Add Room
        </button>
      </div>

      {message ? (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : messageType === 'error' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300'}`}>
          {message}
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            <span className="text-slate-500">🔎</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search rooms..."
              className="w-48 bg-transparent text-sm outline-none"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            <span className="text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="bg-transparent outline-none"
            >
              <option value="ALL" className="bg-slate-900">All</option>
              <option value="AVAILABLE" className="bg-slate-900">Available</option>
              <option value="MAINTENANCE" className="bg-slate-900">Maintenance</option>
              <option value="INACTIVE" className="bg-slate-900">Inactive</option>
            </select>
          </label>
        </div>

        <div className="text-sm text-slate-400">
          Showing {filteredRooms.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredRooms.length)} of {filteredRooms.length} rooms
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
          Loading rooms...
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-10 text-center text-sm text-slate-400">
          No rooms match your current search or filter.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
              <thead className="bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-3">Image</th>
                  <th className="px-3 py-3">Room Name</th>
                  <th className="px-3 py-3">Room Code</th>
                  <th className="px-3 py-3">Capacity</th>
                  <th className="px-3 py-3">Beds</th>
                  <th className="px-3 py-3">Features</th>
                  <th className="px-3 py-3">Amenities</th>
                  <th className="px-3 py-3">Rate</th>
                  <th className="px-3 py-3">Availability</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pagedRooms.map((room) => {
                  const primaryImage = room.images?.find((image) => image.isPrimary) || room.images?.[0];
                  const bedSummary = room.beds && room.beds.length > 0
                    ? room.beds.map((bed) => `${bed.quantity} ${bed.bedTypeId?.name || 'Bed'}`).join(' + ')
                    : '—';
                  const featureSummary = room.features && room.features.length > 0
                    ? room.features.map((feature) => feature.name || 'Feature').join(', ')
                    : '—';
                  const amenitySummary = room.amenities && room.amenities.length > 0
                    ? room.amenities.map((amenity) => amenity.name || 'Amenity').join(', ')
                    : '—';
                  const imageCount = room.images?.length || 0;
                  const availabilityLabel = room.availabilityLabel || 'AVAILABLE';
                  const availabilityClasses = availabilityLabel === 'RESERVED_TODAY'
                    ? 'bg-rose-500/10 text-rose-300'
                    : availabilityLabel === 'UPCOMING_RESERVATION'
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'bg-emerald-500/10 text-emerald-400';
                  const availabilityText = availabilityLabel === 'RESERVED_TODAY'
                    ? 'Reserved Today'
                    : availabilityLabel === 'UPCOMING_RESERVATION'
                      ? 'Upcoming Reservation'
                      : 'Available';

                  return (
                    <tr key={room._id} className="hover:bg-slate-900/60">
                      <td className="px-3 py-3">
                        <div className="flex h-12 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                          {primaryImage?.fileUrl ? (
                            <Image
                              src={primaryImage.fileUrl}
                              alt={primaryImage.altText || room.name}
                              width={400}
                              height={300}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Image</span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{imageCount} image{imageCount === 1 ? '' : 's'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-white">{room.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{room.description || 'No description provided.'}</div>
                      </td>
                      <td className="px-3 py-3">{room.code}</td>
                      <td className="px-3 py-3">{room.maxGuests}</td>
                      <td className="px-3 py-3">{bedSummary}</td>
                      <td className="px-3 py-3 max-w-52.5 text-xs text-slate-300">{featureSummary}</td>
                      <td className="px-3 py-3 max-w-60 text-xs text-slate-300">{amenitySummary}</td>
                      <td className="px-3 py-3">{formatRate(room.nightlyRate)}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${availabilityClasses}`}>
                          {availabilityText}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${room.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' : room.status === 'MAINTENANCE' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-300'}`}>
                          {room.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewRoom(room._id)}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                          >
                            {viewLoading ? 'Loading...' : 'View'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(room)}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchive(room._id)}
                            disabled={processingId === room._id}
                            className="rounded-lg border border-amber-700/30 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-900/20 disabled:opacity-60"
                          >
                            {processingId === room._id ? 'Archiving...' : 'Archive'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              Page {safePage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage === totalPages}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <RoomForm
        open={formOpen}
        mode={formMode}
        roomId={selectedRoom?._id || null}
        initialValues={selectedRoom ? {
          name: selectedRoom.name,
          code: selectedRoom.code,
          maxGuests: selectedRoom.maxGuests,
          status: selectedRoom.status,
          description: selectedRoom.description || '',
          nightlyRate: selectedRoom.nightlyRate,
          halfDayRate: selectedRoom.halfDayRate,
          wholeDayRate: selectedRoom.wholeDayRate,
          beds: (selectedRoom.beds || []).map((bed, index) => ({
            id: `${selectedRoom._id}-${index}`,
            bedTypeId: bed.bedTypeId?.name || 'Double Bed',
            quantity: bed.quantity,
          })),
          features: (selectedRoom.features || []).map((feature) => feature.name || '').filter(Boolean),
          amenities: (selectedRoom.amenities || []).map((amenity) => amenity.name || '').filter(Boolean),
          images: (selectedRoom.images || []).map((image, index) => ({
            id: image._id || `${selectedRoom._id}-${index}`,
            fileUrl: image.fileUrl || '',
            storageKey: image.storageKey,
            altText: image.altText || '',
            sortOrder: image.sortOrder || index + 1,
            isPrimary: image.isPrimary || false,
          })),
        } : null}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      {viewRoom ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50">
            <div className="mb-5 flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Room Details</p>
                <h3 className="text-2xl font-semibold text-white">{viewRoom.name}</h3>
              </div>
              <button type="button" onClick={() => setViewRoom(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Close</button>
            </div>

            <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
              <div><span className="text-slate-500">Room Code:</span> {viewRoom.code}</div>
              <div><span className="text-slate-500">Capacity:</span> {viewRoom.maxGuests}</div>
              <div><span className="text-slate-500">Status:</span> {viewRoom.status}</div>
              <div><span className="text-slate-500">Nightly Rate:</span> {formatRate(viewRoom.nightlyRate)}</div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
              <p className="font-medium text-white">Beds</p>
              <p className="mt-1">
                {(viewRoom.beds || []).length
                  ? (viewRoom.beds || []).map((bed) => `${bed.quantity} ${bed.bedTypeId?.name || 'Bed'}`).join(' + ')
                  : 'No beds configured.'}
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
              <p className="font-medium text-white">Features</p>
              <p className="mt-1 text-slate-400">
                {(viewRoom.features || []).length
                  ? (viewRoom.features || []).map((feature) => feature.name || 'Feature').join(', ')
                  : 'No features configured.'}
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
              <p className="font-medium text-white">Amenities</p>
              <p className="mt-1 text-slate-400">
                {(viewRoom.amenities || []).length
                  ? (viewRoom.amenities || []).map((amenity) => amenity.name || 'Amenity').join(', ')
                  : 'No amenities configured.'}
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
              <p className="font-medium text-white">Images</p>
              {(viewRoom.images || []).length ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(viewRoom.images || []).map((image, index) => (
                    <div key={image._id || `${viewRoom._id}-img-${index}`} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                      {image.fileUrl ? (
                        <Image
                          src={image.fileUrl}
                          alt={image.altText || `${viewRoom.name} image ${index + 1}`}
                          width={400}
                          height={300}
                          className="h-24 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-24 items-center justify-center text-xs text-slate-500">No preview</div>
                      )}
                      <p className="px-2 py-1 text-[11px] text-slate-400">
                        {image.isPrimary ? 'Primary image' : `Image ${index + 1}`}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-slate-400">No images uploaded.</p>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
              <p className="font-medium text-white">Description</p>
              <p className="mt-1 text-slate-400">{viewRoom.description || 'No description provided.'}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
