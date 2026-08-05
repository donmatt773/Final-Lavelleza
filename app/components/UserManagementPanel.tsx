'use client';

import React, { useEffect, useState } from 'react';

type UserRecord = {
  _id: string;
  employeeId: string;
  username: string;
  name: string;
  role: number;
};

type Props = {
  active: boolean;
};

const emptyForm = {
  username: '',
  name: '',
  password: '',
  confirmPassword: '',
  role: '1',
};

export default function UserManagementPanel({ active }: Props) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForm, setShowForm] = useState(true);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Unable to load users');
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    const timeoutId = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [active, loadUsers]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const generateEmployeeId = () => {
    const nextNumber = users.length + 1;
    return `USER-${String(nextNumber).padStart(3, '0')}`;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!form.username || !form.name) {
      setMessage('Please fill in all fields before saving.');
      return;
    }

    if (!editingId && !form.password) {
      setMessage('Password is required when creating a user.');
      return;
    }

    if ((form.password || form.confirmPassword) && form.password !== form.confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    try {
      const url = editingId ? `/api/users/${editingId}` : '/api/users';
      const method = editingId ? 'PUT' : 'POST';
      const employeeId = editingId ? undefined : generateEmployeeId();
      const payload: Record<string, unknown> = {
        employeeId,
        username: form.username,
        name: form.name,
        role: Number(form.role),
      };

      if (form.password.trim()) {
        payload.password = form.password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to save user');
      }

      setMessage(editingId ? 'User updated successfully.' : 'User created successfully.');
      resetForm();
      loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save user');
    }
  };

  const handleEdit = (user: UserRecord) => {
    setEditingId(user._id);
    setForm({
      username: user.username,
      name: user.name,
      password: '',
      confirmPassword: '',
      role: String(user.role),
    });
  };

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Delete this user?')) return;

    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to delete user');
      }
      setMessage('User deleted successfully.');
      loadUsers();
      if (editingId === userId) resetForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete user');
    }
  };

  if (!active) return null;

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">User Management Subview</p>
          <h2 className="text-2xl font-semibold text-white">Create, edit, and remove team accounts</h2>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
          Use this workspace to manage staff and owner access.
        </div>
      </div>

      {message ? (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {message}
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-white">{editingId ? 'Update User' : 'Add New User'}</h3>
              <button
                type="button"
                onClick={() => setShowForm((value) => !value)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                {showForm ? 'Hide Form' : 'Show Form'}
              </button>
            </div>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            ) : null}
          </div>

          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-400">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Auto-generated ID</div>
                <div className="mt-1 font-medium text-white">{editingId ? 'Locked for existing user' : generateEmployeeId()}</div>
              </div>
              <input
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="Username"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>

            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Full Name"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder={editingId ? 'New Password (leave blank to keep current)' : 'Password'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-10 text-sm text-white outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                  placeholder={editingId ? 'Confirm New Password' : 'Confirm Password'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-10 text-sm text-white outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            >
              <option value="0">Owner / Admin</option>
              <option value="1">Staff</option>
            </select>

              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                {editingId ? 'Update User' : 'Create User'}
              </button>
            </form>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Existing Users</h3>
            <span className="text-sm text-slate-400">{users.length} total</span>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-400">No users yet. Create the first one from the form.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
                <thead className="bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Employee ID</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-900/60">
                      <td className="px-3 py-2 font-medium text-white">{user.name}</td>
                      <td className="px-3 py-2">{user.username}</td>
                      <td className="px-3 py-2">{user.employeeId}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${user.role === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {user.role === 0 ? 'Admin' : 'Staff'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(user)}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(user._id)}
                            className="rounded-lg border border-rose-700/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-900/20"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
