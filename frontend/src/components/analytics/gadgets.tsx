'use client';

import { useCallback, useEffect, useState } from 'react';
import { analyticsAPI } from '@/lib/api';
import { DashboardGadget } from '@/types';
import {
  AgingWip,
  ControlChart as ControlChartData,
  CreatedVsResolved,
  CumulativeFlow,
  EpicProgress,
  ProjectOverview,
  Throughput,
  Velocity,
  Workload,
} from '@/types/analytics';
import { ControlChart, CreatedVsResolvedChart, CumulativeFlowChart, OpenBacklogChart, ThroughputChart } from './FlowCharts';
import { AgingWipTable, EpicProgressList, OverviewTiles, StatusBreakdown, WorkloadChart } from './Breakdowns';
import { VelocityChart } from './SprintCharts';

/**
 * What a gadget needs to know to fetch itself. Stored as JSON in the gadget's
 * ``config`` column, so a dashboard remembers which project it points at.
 */
export interface GadgetConfig {
  project_id?: number;
  board_id?: number;
  sprint_id?: number;
  days?: number;
}

type Scope = 'project' | 'board';

export interface GadgetDefinition {
  type: string;
  label: string;
  description: string;
  scope: Scope;
  /** Columns the gadget wants on a 12-column grid. */
  span: number;
}

/**
 * The gadget catalogue. A gadget type that is not in here renders as an unknown
 * block rather than disappearing, so older dashboards degrade visibly.
 */
export const GADGET_DEFINITIONS: GadgetDefinition[] = [
  { type: 'overview', label: 'Delivery overview', description: 'Open work, intake, completion, and cycle time.', scope: 'project', span: 12 },
  { type: 'cumulative_flow', label: 'Cumulative flow', description: 'Issues per status per day.', scope: 'project', span: 8 },
  { type: 'status_breakdown', label: 'Status breakdown', description: 'Where every issue sits right now.', scope: 'project', span: 4 },
  { type: 'control_chart', label: 'Control chart', description: 'Cycle time per completed issue.', scope: 'project', span: 8 },
  { type: 'aging_wip', label: 'Aging work in progress', description: 'In-flight issues by age.', scope: 'project', span: 4 },
  { type: 'created_vs_resolved', label: 'Created vs resolved', description: 'Intake against completion.', scope: 'project', span: 6 },
  { type: 'open_backlog', label: 'Open backlog', description: 'Issues still open over time.', scope: 'project', span: 6 },
  { type: 'throughput', label: 'Throughput', description: 'Issues completed per week by type.', scope: 'project', span: 6 },
  { type: 'workload', label: 'Workload by assignee', description: 'Open issues per person.', scope: 'project', span: 6 },
  { type: 'epic_progress', label: 'Epic progress', description: 'Completion of each epic.', scope: 'project', span: 6 },
  { type: 'velocity', label: 'Velocity', description: 'Committed against completed per sprint.', scope: 'board', span: 6 },
];

export function gadgetDefinition(type: string): GadgetDefinition | undefined {
  return GADGET_DEFINITIONS.find((definition) => definition.type === type);
}

export function parseGadgetConfig(raw: string | null | undefined): GadgetConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as GadgetConfig) : {};
  } catch {
    return {};
  }
}

/** Loading and error chrome shared by every gadget, so none of them render blank. */
function GadgetFrame({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="metric-card flex min-h-[220px] items-center justify-center rounded p-5 text-xs text-slate-500">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="metric-card flex min-h-[220px] flex-col items-center justify-center gap-3 rounded p-5 text-center">
        <p className="text-xs text-slate-600">{error}</p>
        <button onClick={onRetry} className="button-secondary rounded-sm px-3 py-1.5 text-xs font-semibold">
          Retry
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

/** Fetches one gadget's data and hands it to the matching chart. */
export function GadgetRenderer({ gadget }: { gadget: DashboardGadget }) {
  const config = parseGadgetConfig(gadget.config);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const definition = gadgetDefinition(gadget.gadget_type);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = config.days ?? 30;
      const projectId = config.project_id;
      const boardId = config.board_id;

      if (definition?.scope === 'project' && !projectId) {
        throw new Error('This gadget has no project configured.');
      }
      if (definition?.scope === 'board' && !boardId) {
        throw new Error('This gadget has no board configured.');
      }

      let response;
      switch (gadget.gadget_type) {
        case 'overview':
          response = await analyticsAPI.overview(projectId!, days);
          break;
        case 'cumulative_flow':
          response = await analyticsAPI.cumulativeFlow(projectId!, days);
          break;
        case 'status_breakdown':
        case 'workload':
          response = await analyticsAPI.workload(projectId!);
          break;
        case 'control_chart':
          response = await analyticsAPI.controlChart(projectId!, Math.max(days, 30));
          break;
        case 'aging_wip':
          response = await analyticsAPI.agingWip(projectId!);
          break;
        case 'created_vs_resolved':
        case 'open_backlog':
          response = await analyticsAPI.createdVsResolved(projectId!, Math.max(days, 14));
          break;
        case 'throughput':
          response = await analyticsAPI.throughput(projectId!, Math.max(days, 28));
          break;
        case 'epic_progress':
          response = await analyticsAPI.epicProgress(projectId!);
          break;
        case 'velocity':
          response = await analyticsAPI.velocity(boardId!);
          break;
        default:
          throw new Error(`Unknown gadget type "${gadget.gadget_type}".`);
      }
      setData(response.data);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not load this gadget.';
      setError(message);
    } finally {
      setLoading(false);
    }
    // The gadget row is the identity here; config is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gadget.gadget_id, gadget.gadget_type, gadget.config]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GadgetFrame loading={loading} error={error} onRetry={() => void load()}>
      {data ? <GadgetChart type={gadget.gadget_type} data={data} /> : null}
    </GadgetFrame>
  );
}

/** Maps a gadget type onto its chart. Kept separate so it stays easy to extend. */
function GadgetChart({ type, data }: { type: string; data: unknown }) {
  switch (type) {
    case 'overview':
      return <OverviewTiles data={data as ProjectOverview} />;
    case 'cumulative_flow':
      return <CumulativeFlowChart data={data as CumulativeFlow} />;
    case 'status_breakdown':
      return <StatusBreakdown data={data as Workload} />;
    case 'workload':
      return <WorkloadChart data={data as Workload} />;
    case 'control_chart':
      return <ControlChart data={data as ControlChartData} />;
    case 'aging_wip':
      return <AgingWipTable data={data as AgingWip} />;
    case 'created_vs_resolved':
      return <CreatedVsResolvedChart data={data as CreatedVsResolved} />;
    case 'open_backlog':
      return <OpenBacklogChart data={data as CreatedVsResolved} />;
    case 'throughput':
      return <ThroughputChart data={data as Throughput} />;
    case 'epic_progress':
      return <EpicProgressList data={data as EpicProgress} />;
    case 'velocity':
      return <VelocityChart data={data as Velocity} />;
    default:
      return (
        <div className="metric-card rounded p-5 text-xs text-slate-500">
          No renderer for gadget type &ldquo;{type}&rdquo;.
        </div>
      );
  }
}
