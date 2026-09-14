'use client';

import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, Legend, TooltipShell } from './ChartCard';
import { axisProps, formatNumber, gridProps, ink, seriesColor, stageColor, status } from '@/lib/analytics-theme';
import { AgingWip, EpicProgress, ProjectOverview, Workload } from '@/types/analytics';

/**
 * A single headline number with its change against the previous window. The
 * arrow and the word carry the direction; colour only reinforces it.
 */
export function StatTile({
  label,
  value,
  suffix,
  change,
  higherIsBetter = true,
  hint,
}: {
  label: string;
  value: string;
  suffix?: string;
  change?: number | null;
  higherIsBetter?: boolean;
  hint?: string;
}) {
  const hasChange = change !== null && change !== undefined && Number.isFinite(change);
  const isUp = hasChange && (change as number) > 0;
  const isFlat = hasChange && (change as number) === 0;
  const isGood = higherIsBetter ? isUp : !isUp;

  return (
    <div className="metric-card rounded p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-slate-950">{value}</span>
        {suffix ? <span className="text-xs text-slate-500">{suffix}</span> : null}
      </p>
      {hasChange && !isFlat ? (
        <p
          className="mt-2 text-xs font-medium"
          style={{ color: isGood ? status.good : status.critical }}
        >
          {isUp ? '▲' : '▼'} {Math.abs(change as number)}% vs previous period
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-400">{hint ?? (isFlat ? 'No change' : 'No prior period')}</p>
      )}
    </div>
  );
}

/** The overview row: four tiles, because these are single numbers, not charts. */
export function OverviewTiles({ data }: { data: ProjectOverview }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Open work"
        value={String(data.totals.open + data.totals.in_progress)}
        suffix="issues"
        hint={`${data.totals.in_progress} in progress`}
      />
      <StatTile
        label={`Created · last ${data.window_days}d`}
        value={String(data.created.current)}
        change={data.created.change}
        higherIsBetter={false}
      />
      <StatTile
        label={`Resolved · last ${data.window_days}d`}
        value={String(data.resolved.current)}
        change={data.resolved.change}
        higherIsBetter
      />
      <StatTile
        label="Median cycle time"
        value={data.median_cycle_time_days === null ? '—' : formatNumber(data.median_cycle_time_days)}
        suffix="days"
        hint={`${data.totals.completion_rate}% of all issues done`}
      />
    </div>
  );
}

/** Open issues per assignee. One series, so every bar takes the same colour. */
export function WorkloadChart({ data }: { data: Workload }) {
  const rows = data.by_assignee.slice(0, 10);

  return (
    <ChartCard
      title="Workload by assignee"
      subtitle="Open issues per person, excluding completed work."
      isEmpty={rows.length === 0}
      emptyMessage="No open work assigned."
    >
      <div style={{ height: Math.max(rows.length * 34 + 24, 120) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 8 }}>
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="assignee" width={110} {...axisProps} />
            <Tooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Workload['by_assignee'][number];
                return (
                  <TooltipShell
                    title={row.assignee}
                    rows={[
                      { label: 'Open issues', value: String(row.issues), color: seriesColor(0) },
                      { label: 'Estimated hours', value: formatNumber(row.hours) },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="issues"
              fill={seriesColor(0)}
              radius={[0, 4, 4, 0]}
              barSize={16}
              label={{ position: 'right', fill: ink.secondary, fontSize: 11 }}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** Where open work sits right now, as an ordered set of stages. */
export function StatusBreakdown({ data }: { data: Workload }) {
  const total = data.by_status.reduce((sum, row) => sum + row.count, 0);

  return (
    <ChartCard
      title="Status breakdown"
      subtitle="Every issue in the project by workflow stage."
      figure={String(total)}
      figureLabel="issues"
      isEmpty={total === 0}
    >
      <div className="space-y-3">
        {data.by_status.map((row, index) => {
          const share = total ? (row.count / total) * 100 : 0;
          const color = stageColor(index, data.by_status.length);
          return (
            <div key={row.name}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-slate-700">{row.name}</span>
                <span className="tabular-nums text-slate-500">
                  {row.count} · {share.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

/** Epic completion, stacked by the stage its children sit in. */
export function EpicProgressList({ data }: { data: EpicProgress }) {
  return (
    <ChartCard
      title="Epic progress"
      subtitle="Completion of each epic, based on its linked child issues."
      isEmpty={data.epics.length === 0}
      emptyMessage="No epics with linked issues in this project."
    >
      <div className="space-y-4">
        {data.epics.map((epic) => (
          <div key={epic.issue_id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/issues/${epic.issue_id}`} className="min-w-0 text-xs font-semibold text-slate-800 hover:text-sky-700">
                <span className="tabular-nums text-slate-500">{epic.issue_key}</span> · {epic.summary}
              </Link>
              <span className="tabular-nums text-xs text-slate-500">
                {epic.done}/{epic.total} done · {epic.percent_complete}%
              </span>
            </div>
            <div className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100">
              {([
                ['done', epic.done, stageColor(3, 4)],
                ['inprogress', epic.in_progress, stageColor(2, 4)],
                ['todo', epic.todo, stageColor(0, 4)],
              ] as const).map(([key, count, color]) =>
                count > 0 ? (
                  <div
                    key={key}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${(count / epic.total) * 100}%`, backgroundColor: color }}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <Legend
        items={[
          { label: 'Done', color: stageColor(3, 4) },
          { label: 'In progress', color: stageColor(2, 4) },
          { label: 'To do', color: stageColor(0, 4) },
        ]}
      />
    </ChartCard>
  );
}

/**
 * In-flight issues ordered by age. This is a table on purpose: the question is
 * "which ones", and a reader needs the keys to act on them.
 */
export function AgingWipTable({ data }: { data: AgingWip }) {
  const rows = data.items.slice(0, 12);
  const threshold = data.median_age_days ? data.median_age_days * 2 : Infinity;

  return (
    <ChartCard
      title="Aging work in progress"
      subtitle="How long each in-flight issue has been moving."
      figure={data.median_age_days === null ? '—' : `${formatNumber(data.median_age_days)}d`}
      figureLabel="median age"
      isEmpty={rows.length === 0}
      emptyMessage="Nothing is in progress right now."
      actions={
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.7rem] font-medium text-slate-600">
          {data.count} in flight
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="pb-2 pr-3 font-medium">Issue</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 font-medium">Assignee</th>
              <th className="pb-2 text-right font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const isStale = item.age_days > threshold;
              return (
                <tr key={item.issue_id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/issues/${item.issue_id}`} className="font-medium text-slate-800 hover:text-sky-700">
                      <span className="tabular-nums text-slate-500">{item.issue_key}</span> · {item.summary}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{item.status}</td>
                  <td className="py-2 pr-3 text-slate-600">{item.assignee ?? 'Unassigned'}</td>
                  <td className="py-2 text-right tabular-nums" style={{ color: isStale ? status.critical : ink.secondary }}>
                    {isStale ? '⚠ ' : ''}
                    {formatNumber(item.age_days)}d
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.items.length > rows.length ? (
        <p className="mt-3 text-[0.7rem] text-slate-500">
          Showing the {rows.length} oldest of {data.items.length}.
        </p>
      ) : null}
    </ChartCard>
  );
}
