'use client';

import React, { useEffect, useState } from 'react';

type AddOnRecord = {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  isActive: boolean;
  stockQuantity?: number | null;
};

type FormState = {
  name: string;
  description: string;
  category: string;
  price: string;
  stockQuantity: string;
};

const emptyForm: FormState = { name: '', description: '', category: 'OTHER', price: '0', stockQuantity: '' };

const formatMoney = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function AddOnManagementPanel({ active }: { active: boolean }) {
  const [addOns, setAddOns] = useState<AddOnRecord[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const loadAddOns = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/add-ons?includeInactive=true', { credentials: 'same-origin' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.message || 'Unable to load add-ons.');
      setAddOns(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load add-ons.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    const timeoutId = window.setTimeout(() => {
      void loadAddOns();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [active]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(editingId ? `/api/add-ons/${editingId}` : '/api/add-ons', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          category: form.category,
          price: Number(form.price),
          stockQuantity: form.stockQuantity === '' ? null : Number(form.stockQuantity),
          isActive: true,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'Unable to save add-on.');
      resetForm();
      setMessage(editingId ? 'Add-on updated successfully.' : 'Add-on created successfully.');
      await loadAddOns();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save add-on.');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const edit = (addOn: AddOnRecord) => {
    setEditingId(addOn._id);
    setForm({ name: addOn.name, description: addOn.description || '', category: addOn.category || 'OTHER', price: String(addOn.price), stockQuantity: addOn.stockQuantity === null || addOn.stockQuantity === undefined ? '' : String(addOn.stockQuantity) });
  };

  const toggleActive = async (addOn: AddOnRecord) => {
    const response = await fetch(`/api/add-ons/${addOn._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ isActive: !addOn.isActive }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setMessage(data?.message || 'Unable to update add-on status.');
      setMessageType('error');
      return;
    }
    await loadAddOns();
  };

  if (!active) return null;

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-4 text-slate-300 shadow-2xl shadow-black/30 sm:p-6">
      <div className="mb-6 border-b border-slate-800 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Add-On Management</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Manage reservation extras</h2>
        <p className="mt-2 text-sm text-slate-400">Configure pillows, blankets, soap, towels, and other chargeable items.</p>
        <p className="mt-1 text-xs text-slate-500">Stock is shared across overlapping stays. Cancelled, no-show, and checked-out reservations release reusable items. Leave stock blank for unlimited items.</p>
      </div>

      {message ? <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'error' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>{message}</div> : null}

      <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:grid-cols-2">
        <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Item name" required className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
        <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
        <input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} placeholder="Price" required className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
        <input type="number" min="0" step="1" value={form.stockQuantity} onChange={(event) => setForm((current) => ({ ...current, stockQuantity: event.target.value }))} placeholder="Stock quantity (optional)" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
        <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" rows={2} className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
        <div className="md:col-span-2 flex justify-end gap-2">
          {editingId ? <button type="button" onClick={resetForm} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button> : null}
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update Add-On' : 'Add Add-On'}</button>
        </div>
      </form>

      {loading ? <p className="text-sm text-slate-400">Loading add-ons...</p> : addOns.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center text-sm text-slate-400">No add-ons configured.</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Item</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Stock</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {addOns.map((addOn) => <tr key={addOn._id}><td className="px-3 py-3"><p className="font-semibold text-white">{addOn.name}</p><p className="text-xs text-slate-500">{addOn.description || '—'}</p></td><td className="px-3 py-3">{addOn.category || 'OTHER'}</td><td className="px-3 py-3 text-emerald-300">{formatMoney(addOn.price)}</td><td className="px-3 py-3">{addOn.stockQuantity ?? 'Unlimited'}</td><td className="px-3 py-3">{addOn.isActive ? <span className="text-emerald-300">Active</span> : <span className="text-slate-500">Inactive</span>}</td><td className="px-3 py-3"><div className="flex gap-2"><button type="button" onClick={() => edit(addOn)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">Edit</button><button type="button" onClick={() => { void toggleActive(addOn); }} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">{addOn.isActive ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
