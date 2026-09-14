'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, Legend, TooltipShell } from './ChartCard';
import { axisProps, formatDay, formatNumber, gridProps, ink, series } from '@/lib/analytics-theme';
import { Burndown, Velocity } from '@/types/analytics';

const unitLabel = (unit: 'count' | 'hours') => (unit === 'hours' ? 'hours' : 'issues');

/**
 * Remaining work against the ideal path. Days after today are left empty rather
 * than drawn at zero, so an in-flight sprint does not look finished.
 */
export function BurndownChart({ data }: { data: Burndown }) {
  const unit = unitLabel(data.unit);
  const hasProgress = data.points.some((point) => point.remaining !== null);

  return (
    <ChartCard
      title={`Burndown — ${data.sprint.name}`}
      subtitle={
        data.scope_added > 0
          ? `${formatNumber(data.committed)} ${unit} committed, ${formatNumber(data.scope_added)} added after the sprint opened.`
          : `${formatNumber(data.committed)} ${unit} committed.`
      }
      coverage={data.coverage}
      isEmpty={!hasProgress}
      emptyMessage="This sprint has no issues to burn down."
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.points} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" tickFormatter={formatDay} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ stroke: ink.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as Burndown['points'][number];
                return (
                  <TooltipShell
                    title={formatDay(String(label))}
                    rows={[
                      { label: `Remaining (${unit})`, value: formatNumber(point.remaining), color: series[0] },
                      { label: 'Ideal', value: formatNumber(point.ideal), color: ink.muted },
                      { label: 'Completed', value: formatNumber(point.completed) },
                      { label: 'Scope', value: formatNumber(point.scope) },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="linear"
              dataKey="ideal"
              stroke={ink.muted}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="remaining"
              stroke={series[0]}
              strokeWidth={2}
              dot={{ r: 3, fill: series[0], stroke: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: `Remaining ${unit}`, color: series[0] },
          { label: 'Ideal path', color: ink.muted, dashed: true },
        ]}
      />
    </ChartCard>
  );
}

/**
 * Committed against completed work per closed sprint. Predictability is the mean
 * ratio of the two, which says more about planning than the raw average does.
 */
export function VelocityChart({ data }: { data: Velocity }) {
  const unit = unitLabel(data.unit);

  return (
    <ChartCard
      title="Velocity"
      subtitle={`Committed against completed ${unit} per sprint.`}
      figure={formatNumber(data.average_velocity)}
      figureLabel={`average ${unit} completed`}
      coverage={data.coverage}
      isEmpty={data.sprints.length === 0}
      emptyMessage="No sprints on this board yet."
      actions={
        data.predictability !== null ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.7rem] font-medium text-slate-600">
            {Math.round(data.predictability * 100)}% of plan delivered
          </span>
        ) : null
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.sprints} margin={{ top: 8, right: 12, bottom: 4, left: -18 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as Velocity['sprints'][number];
                return (
                  <TooltipShell
                    title={point.name}
                    rows={[
                      { label: 'Committed', value: formatNumber(point.committed), color: series[0] },
                      { label: 'Completed', value: formatNumber(point.completed), color: series[1] },
                      { label: 'Issues in sprint', value: String(point.issue_count) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="committed" fill={series[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="completed" fill={series[1]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: 'Committed', color: series[0] },
          { label: 'Completed', color: series[1] },
        ]}
      />
    </ChartCard>
  );
}
