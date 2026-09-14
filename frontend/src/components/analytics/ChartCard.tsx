'use client';

import { ReactNode } from 'react';
import { Coverage } from '@/types/analytics';

/**
 * The shell every chart sits in: a title, an optional headline figure, and the
 * measurement-quality note. Keeping the chrome here means each chart component
 * only has to draw its marks.
 */
export function ChartCard({
  title,
  subtitle,
  figure,
  figureLabel,
  actions,
  coverage,
  isEmpty,
  emptyMessage = 'No data in this window yet.',
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  figure?: string;
  figureLabel?: string;
  actions?: ReactNode;
  coverage?: Coverage;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`metric-card flex flex-col rounded p-5 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
        </div>
        {actions}
      </header>

      {figure ? (
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight text-slate-950">{figure}</span>
          {figureLabel ? <span className="text-xs text-slate-500">{figureLabel}</span> : null}
        </div>
      ) : null}

      <div className="mt-4 flex-1">
        {isEmpty ? (
          <div className="flex h-full min-h-[180px] items-center justify-center rounded-sm border border-dashed border-slate-300 px-4 py-10 text-center text-xs text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>

      {coverage ? <CoverageNote coverage={coverage} /> : null}
    </section>
  );
}

/**
 * Says plainly how much of the chart was measured. Issues that predate status
 * history recording are reconstructed from their created and updated times, and
 * a reader deserves to know which they are looking at.
 */
export function CoverageNote({ coverage }: { coverage: Coverage }) {
  if (!coverage.issues || coverage.estimated === 0) return null;

  const percent = Math.round(coverage.observed_ratio * 100);
  return (
    <p className="mt-4 border-t border-slate-200/80 pt-3 text-[0.7rem] leading-5 text-slate-500">
      <span className="font-semibold text-slate-600">{percent}% measured.</span>{' '}
      {coverage.estimated} of {coverage.issues} issues have no recorded status history, so their
      transition times are estimated from created and updated timestamps.
    </p>
  );
}

/** A labelled swatch row. Identity is never carried by colour alone. */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-xs text-slate-600">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={
              item.dashed
                ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 3px, transparent 3px 6px)` }
                : { backgroundColor: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Shared tooltip surface so hover reads identically across every chart. */
export function TooltipShell({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-sm border border-slate-200 bg-white px-3 py-2 shadow-[0_12px_28px_rgba(15,23,42,0.14)]">
      <p className="text-xs font-semibold text-slate-900">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs text-slate-600">
            {row.color ? (
              <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
            ) : null}
            <span>{row.label}</span>
            <span className="ml-auto font-medium tabular-nums text-slate-900">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
