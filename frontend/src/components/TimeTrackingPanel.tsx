'use client';

import { useMemo, useState } from 'react';
import { Issue, Worklog } from '@/types';
import { issueAPI } from '@/lib/api';

type Adjustment = 'auto' | 'leave' | 'set' | 'reduce';

const ADJUSTMENTS: { value: Adjustment; label: string; needsValue: boolean }[] = [
  { value: 'auto', label: 'Adjust automatically', needsValue: false },
  { value: 'leave', label: 'Leave unchanged', needsValue: false },
  { value: 'set', label: 'Set to', needsValue: true },
  { value: 'reduce', label: 'Reduce by', needsValue: true },
];

const hours = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Number(value) % 1 === 0 ? Number(value) : Number(value).toFixed(2)}h`;

/**
 * Time tracking that can actually be changed.
 *
 * Three numbers matter and they are not interchangeable: the original estimate
 * is a fixed baseline, the remaining estimate is a forecast that moves, and
 * logged time is a fact that only grows. The bar compares logged against the
 * original, so an overrun shows as the bar passing its own baseline rather than
 * silently clamping.
 */
export function TimeTrackingPanel({
  issue,
  worklogs,
  onChanged,
  canEdit = true,
}: {
  issue: Issue;
  worklogs: Worklog[];
  onChanged: () => Promise<void> | void;
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [timeSpent, setTimeSpent] = useState('');
  const [comment, setComment] = useState('');
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [adjustment, setAdjustment] = useState<Adjustment>('auto');
  const [adjustmentValue, setAdjustmentValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const original = issue.original_estimate ?? null;
  const remaining = issue.remaining_estimate ?? null;
  const logged = Number(issue.time_spent ?? 0);

  const bar = useMemo(() => {
    // Scale to whichever is larger, so an overrun stays on screen.
    const baseline = Number(original ?? 0);
    const span = Math.max(baseline, logged + Number(remaining ?? 0), 1);
    return {
      loggedPercent: Math.min((logged / span) * 100, 100),
      remainingPercent: Math.min((Number(remaining ?? 0) / span) * 100, 100 - Math.min((logged / span) * 100, 100)),
      overrun: baseline > 0 && logged > baseline,
      overBy: baseline > 0 ? logged - baseline : 0,
    };
  }, [original, remaining, logged]);

  const submit = async () => {
    const spent = Number(timeSpent);
    if (!Number.isFinite(spent) || spent <= 0) {
      setError('Enter how many hours to log.');
      return;
    }
    const needsValue = ADJUSTMENTS.find((item) => item.value === adjustment)?.needsValue;
    const value = Number(adjustmentValue);
    if (needsValue && (!Number.isFinite(value) || value < 0)) {
      setError('Enter the remaining estimate in hours.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await issueAPI.addWorklog(issue.issue_id, {
        time_spent: spent,
        comment: comment.trim() || undefined,
        started_at: new Date(startedAt).toISOString(),
        remaining_adjustment: adjustment,
        remaining_value: needsValue ? value : undefined,
      });
      setTimeSpent('');
      setComment('');
      setAdjustmentValue('');
      setAdjustment('auto');
      setStartedAt(new Date().toISOString().slice(0, 16));
      setOpen(false);
      await onChanged();
    } catch (caught) {
      const detail = caught as { response?: { data?: { detail?: string } } };
      setError(detail.response?.data?.detail || 'Could not log this work.');
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (worklogId: number) => {
    setBusy(true);
    setError('');
    try {
      await issueAPI.deleteWorklog(issue.issue_id, worklogId);
      await onChanged();
    } catch (caught) {
      const detail = caught as { response?: { data?: { detail?: string } } };
      setError(detail.response?.data?.detail || 'Could not remove this entry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-panel rounded">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Time tracking</h3>
        {canEdit ? (
          <button onClick={() => setOpen((value) => !value)} className="command-button h-7 px-2 text-xs font-semibold">
            {open ? 'Close' : 'Log work'}
          </button>
        ) : null}
      </div>

      <div className="space-y-3 px-5 py-4">
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-sm bg-slate-100" role="img" aria-label={`${hours(logged)} logged of ${hours(original)} estimated`}>
            <div
              className="h-full"
              style={{
                width: `${bar.loggedPercent}%`,
                backgroundColor: bar.overrun ? 'var(--status-error, #a4262c)' : 'var(--accent)',
              }}
            />
            <div className="h-full" style={{ width: `${bar.remainingPercent}%`, backgroundColor: '#86b6ef' }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-slate-600">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: bar.overrun ? '#a4262c' : 'var(--accent)' }} />
              Logged
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: '#86b6ef' }} />
              Remaining
            </span>
          </div>
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Original estimate</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{hours(original)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Remaining</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{hours(remaining)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Logged</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{hours(logged)}</dd>
          </div>
        </dl>

        {bar.overrun ? (
          <p className="rounded-sm bg-rose-50 px-2.5 py-1.5 text-[0.7rem] font-medium text-rose-700">
            Over the original estimate by {hours(bar.overBy)}.
          </p>
        ) : null}

        {error ? <p className="text-[0.7rem] text-rose-600">{error}</p> : null}

        {open ? (
          <div className="space-y-2.5 border-t border-slate-200 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-slate-600">
                Time spent (hours)
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  value={timeSpent}
                  onChange={(event) => setTimeSpent(event.target.value)}
                  className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm font-normal"
                  placeholder="2"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Started
                <input
                  type="datetime-local"
                  value={startedAt}
                  onChange={(event) => setStartedAt(event.target.value)}
                  className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm font-normal"
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600">Remaining estimate</p>
              <div className="mt-1 space-y-1">
                {ADJUSTMENTS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="radio"
                      name="remaining-adjustment"
                      checked={adjustment === option.value}
                      onChange={() => setAdjustment(option.value)}
                    />
                    {option.label}
                    {option.needsValue && adjustment === option.value ? (
                      <input
                        type="number"
                        min={0}
                        step={0.25}
                        value={adjustmentValue}
                        onChange={(event) => setAdjustmentValue(event.target.value)}
                        className="ml-1 w-20 rounded-sm border border-slate-300 px-1.5 py-1 text-xs"
                        placeholder="hours"
                      />
                    ) : null}
                  </label>
                ))}
              </div>
            </div>

            <label className="block text-xs font-semibold text-slate-600">
              Work description
              <textarea
                rows={2}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm font-normal"
                placeholder="What did you do?"
              />
            </label>

            <div className="flex items-center gap-2">
              <button onClick={() => void submit()} disabled={busy} className="button-primary h-8 px-3 text-xs disabled:opacity-60">
                {busy ? 'Logging…' : 'Log work'}
              </button>
              <button onClick={() => { setOpen(false); setError(''); }} className="button-secondary h-8 px-3 text-xs">
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {worklogs.length > 0 ? (
          <div className="border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold text-slate-600">Recent entries</p>
            <ul className="mt-2 space-y-2">
              {worklogs.slice(0, 5).map((entry) => (
                <li key={entry.worklog_id} className="flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {hours(entry.time_spent)} · {entry.display_name || entry.username}
                    </p>
                    <p className="text-slate-500">{new Date(entry.started_at).toLocaleString()}</p>
                    {entry.comment ? <p className="mt-0.5 text-slate-600">{entry.comment}</p> : null}
                  </div>
                  {canEdit ? (
                    <button
                      onClick={() => void removeEntry(entry.worklog_id)}
                      disabled={busy}
                      className="shrink-0 text-[0.7rem] font-semibold text-slate-500 transition hover:text-rose-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
