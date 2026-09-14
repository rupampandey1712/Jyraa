'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, Legend, TooltipShell } from './ChartCard';
import {
  axisProps,
  formatDay,
  formatNumber,
  gridProps,
  ink,
  seriesColor,
  stageColor,
  status,
} from '@/lib/analytics-theme';
import { ControlChart as ControlChartData, CreatedVsResolved, CumulativeFlow, Throughput } from '@/types/analytics';

/**
 * Issues stacked by status over time. Band thickness is the amount of work
 * sitting in a stage: a widening middle band is a queue forming.
 *
 * Statuses are an ordered progression, not unrelated identities, so they take
 * the single-hue stage ramp rather than categorical colours.
 */
export function CumulativeFlowChart({ data }: { data: CumulativeFlow }) {
  // The backend returns the flow reversed so finished work stacks at the bottom.
  const colors = useMemo(
    () => data.series.map((_, index) => stageColor(data.series.length - 1 - index, data.series.length)),
    [data.series],
  );
  const hasData = data.points.some((point) => data.series.some((entry) => Number(point[entry.key]) > 0));

  return (
    <ChartCard
      title="Cumulative flow"
      subtitle="Issues in each status per day. A widening band is work piling up in that stage."
      coverage={data.coverage}
      isEmpty={!hasData}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" tickFormatter={formatDay} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ stroke: ink.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <TooltipShell
                    title={formatDay(String(label))}
                    rows={data.series.map((entry, index) => ({
                      label: entry.key,
                      value: formatNumber(Number(payload[0].payload[entry.key] ?? 0)),
                      color: colors[index],
                    }))}
                  />
                );
              }}
            />
            {data.series.map((entry, index) => (
              <Area
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                stackId="flow"
                stroke="#ffffff"
                strokeWidth={2}
                fill={colors[index]}
                fillOpacity={1}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Legend items={data.series.map((entry, index) => ({ label: entry.key, color: colors[index] }))} />
    </ChartCard>
  );
}

/**
 * Cycle time per completed issue, with a rolling average and a one-deviation
 * band. Points above the band are the outliers worth asking about.
 */
export function ControlChart({ data }: { data: ControlChartData }) {
  // Plotted against real time, not against position in the list: on a category
  // axis a two-day gap and a two-week gap look identical, which misreads badly
  // on a chart whose whole subject is how long things take.
  const points = useMemo(
    () =>
      data.points.map((point) => ({
        ...point,
        completed_ms: new Date(point.completed_at).getTime(),
        band: [point.band_lower, point.band_upper] as [number, number],
      })),
    [data.points],
  );
  const fallbackCount = data.points.filter((point) => point.lead_time_fallback).length;

  return (
    <ChartCard
      title="Cycle time control chart"
      subtitle="Days from first in-progress to done, per completed issue."
      figure={data.median_days === null ? '—' : `${formatNumber(data.median_days)}d`}
      figureLabel="median cycle time"
      coverage={data.coverage}
      isEmpty={points.length === 0}
      emptyMessage="No issues completed in this window."
      actions={
        data.p85_days !== null ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.7rem] font-medium text-slate-600">
            85th percentile {formatNumber(data.p85_days)}d
          </span>
        ) : null
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="completed_ms"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value: number) => formatDay(new Date(value).toISOString())}
              {...axisProps}
            />
            <YAxis {...axisProps} unit="d" />
            <Tooltip
              cursor={{ stroke: ink.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof points)[number];
                return (
                  <TooltipShell
                    title={`${point.issue_key} · ${point.summary}`}
                    rows={[
                      {
                        label: point.lead_time_fallback ? 'Lead time (no start recorded)' : 'Cycle time',
                        value: `${formatNumber(point.days)}d`,
                        color: seriesColor(0),
                      },
                      { label: 'Rolling average', value: `${formatNumber(point.rolling_average)}d`, color: seriesColor(1) },
                      { label: 'Completed', value: formatDay(point.completed_at) },
                    ]}
                  />
                );
              }}
            />
            <Area
              dataKey="band"
              stroke="none"
              fill={seriesColor(0)}
              fillOpacity={0.12}
              isAnimationActive={false}
            />
            <Scatter dataKey="days" fill={seriesColor(0)} shape="circle" isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="rolling_average"
              stroke={seriesColor(1)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: 'Completed issue', color: seriesColor(0) },
          { label: 'Rolling average', color: seriesColor(1) },
        ]}
      />
      {fallbackCount > 0 ? (
        <p className="mt-2 text-[0.7rem] leading-5 text-slate-500">
          {fallbackCount} issue{fallbackCount === 1 ? '' : 's'} never recorded an in-progress transition, so
          {fallbackCount === 1 ? ' its' : ' their'} lead time from creation is plotted instead.
        </p>
      ) : null}
    </ChartCard>
  );
}

/**
 * Intake against completion. When created outruns resolved the backlog grows,
 * which the separate open-backlog chart shows on its own scale.
 */
export function CreatedVsResolvedChart({ data }: { data: CreatedVsResolved }) {
  const hasData = data.total_created > 0 || data.total_resolved > 0;

  return (
    <ChartCard
      title="Created vs resolved"
      subtitle={`${data.total_created} created, ${data.total_resolved} resolved in this window.`}
      coverage={data.coverage}
      isEmpty={!hasData}
      actions={
        data.resolution_rate !== null ? (
          <span
            className="rounded-full px-2.5 py-1 text-[0.7rem] font-medium"
            style={{
              backgroundColor: data.resolution_rate >= 1 ? '#dff6dd' : '#fdd8db',
              color: data.resolution_rate >= 1 ? status.good : status.critical,
            }}
          >
            {data.resolution_rate >= 1 ? 'Keeping up' : 'Falling behind'} · {Math.round(data.resolution_rate * 100)}%
          </span>
        ) : null
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.points} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="period" tickFormatter={formatDay} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ stroke: ink.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as CreatedVsResolved['points'][number];
                return (
                  <TooltipShell
                    title={formatDay(String(label))}
                    rows={[
                      { label: 'Created', value: String(point.created), color: seriesColor(0) },
                      { label: 'Resolved', value: String(point.resolved), color: seriesColor(1) },
                      { label: 'Open at end of day', value: String(point.open) },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="created"
              stroke={seriesColor(0)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="resolved"
              stroke={seriesColor(1)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: 'Created', color: seriesColor(0) },
          { label: 'Resolved', color: seriesColor(1) },
        ]}
      />
    </ChartCard>
  );
}

/** Open backlog over time, on its own axis rather than sharing one with intake. */
export function OpenBacklogChart({ data }: { data: CreatedVsResolved }) {
  const latest = data.points[data.points.length - 1];

  return (
    <ChartCard
      title="Open backlog"
      subtitle="Issues still open at the end of each period."
      figure={latest ? String(latest.open) : '—'}
      figureLabel="open now"
      isEmpty={data.points.length === 0}
    >
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="period" tickFormatter={formatDay} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ stroke: ink.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as CreatedVsResolved['points'][number];
                return (
                  <TooltipShell
                    title={formatDay(String(label))}
                    rows={[{ label: 'Open', value: String(point.open), color: seriesColor(0) }]}
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="open"
              stroke={seriesColor(0)}
              strokeWidth={2}
              fill={seriesColor(0)}
              fillOpacity={0.14}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** Issues completed per week, split by type. */
export function ThroughputChart({ data }: { data: Throughput }) {
  const hasData = data.points.some((point) => Number(point.total) > 0);

  return (
    <ChartCard
      title="Throughput"
      subtitle="Issues completed per week, by type."
      figure={formatNumber(data.average_per_week)}
      figureLabel="average per week"
      coverage={data.coverage}
      isEmpty={!hasData}
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.points} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="period" tickFormatter={formatDay} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, number | string>;
                return (
                  <TooltipShell
                    title={`Week of ${formatDay(String(label))}`}
                    rows={[
                      ...data.series.map((name, index) => ({
                        label: name,
                        value: String(row[name] ?? 0),
                        color: seriesColor(index),
                      })),
                      { label: 'Total', value: String(row.total ?? 0) },
                    ]}
                  />
                );
              }}
            />
            {data.series.map((name, index) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="throughput"
                fill={seriesColor(index)}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={data.series.map((name, index) => ({ label: name, color: seriesColor(index) }))} />
    </ChartCard>
  );
}
