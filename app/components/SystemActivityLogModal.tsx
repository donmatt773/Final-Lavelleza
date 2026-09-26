'use client';

import React, { useEffect, useState } from 'react';

type AuditLogRecord = {
  _id: string;
  actorName: string;
  actorEmployeeId?: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel: string;
  summary: string;
  changedFields?: string[];
  createdAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const PAGE_SIZE = 50;

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function SystemActivityLogModal({ open, onClose }: Props) {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadPage = async (requestedPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/audit-logs?page=${requestedPage}&limit=${PAGE_SIZE}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load the activity log.');
      }

      const nextLogs = Array.isArray(data.logs) ? data.logs as AuditLogRecord[] : [];
      setLogs((current) => append ? [...current, ...nextLogs] : nextLogs);
      setPage(requestedPage);
      setTotal(Number(data.total || 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the activity log.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const timeoutId = window.setTimeout(() => { void loadPage(1, false); }, 0);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(timeoutId);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-activity-log-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Owner audit trail</p>
            <h2 id="system-activity-log-title" className="mt-1 text-xl font-semibold text-white">System Activity Log</h2>
            <p className="mt-1 text-xs text-slate-400">{total} recorded event{total === 1 ? '' : 's'}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => { void loadPage(1, false); }}
              disabled={loading}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close activity log"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-lg text-slate-300 hover:bg-slate-800"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {error ? <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p> : null}
          {loading ? <p className="py-10 text-center text-sm text-slate-400">Loading activity...</p> : null}
          {!loading && !error && logs.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No activity has been recorded yet.</p> : null}

          {!loading && logs.length > 0 ? (
            <ol className="space-y-2">
              {logs.map((log) => (
                <li key={log._id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{log.summary}</p>
                      <p className="mt-1 break-words text-xs text-slate-400">
                        {log.actorName}{log.actorEmployeeId ? ` · ${log.actorEmployeeId}` : ''} · {log.actorRole}
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-500">{log.entityType.replace('_', ' ')} · {log.entityLabel}</p>
                      {log.changedFields && log.changedFields.length > 0 ? (
                        <p className="mt-2 break-words text-[11px] text-slate-500">Changed: {log.changedFields.join(', ')}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <span className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">{log.action.replaceAll('_', ' ')}</span>
                      <time className="text-[11px] text-slate-500">{formatTimestamp(log.createdAt)}</time>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {!loading && logs.length < total ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => { void loadPage(page + 1, true); }}
                disabled={loadingMore}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load older activity'}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}