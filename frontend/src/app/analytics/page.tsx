'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { analyticsAPI, boardAPI, projectAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Board, Project, Sprint } from '@/types';
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
import { ControlChart, CreatedVsResolvedChart, CumulativeFlowChart, OpenBacklogChart, ThroughputChart } from '@/components/analytics/FlowCharts';
import { AgingWipTable, EpicProgressList, OverviewTiles, StatusBreakdown, WorkloadChart } from '@/components/analytics/Breakdowns';
import { BurndownChart, VelocityChart } from '@/components/analytics/SprintCharts';
import { Burndown } from '@/types/analytics';

/**
 * Turn a failed request into something a reader can act on. Swallowing the
 * reason makes an outage and a bad project id look identical on screen.
 */
function describeRequestFailure(caught: unknown, fallback: string): string {
  const detail = (caught as { response?: { status?: number; data?: { detail?: string } }; message?: string }) ?? {};
  const status = detail.response?.status;
  const serverDetail = detail.response?.data?.detail;
  if (serverDetail) return `${fallback} ${status ?? ''} ${serverDetail}`.trim();
  if (status) return `${fallback} (HTTP ${status})`;
  if (detail.message) return `${fallback} ${detail.message}`;
  return fallback;
}

const WINDOWS = [
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/** Everything the page loads for the selected project, kept in one place. */
interface ProjectAnalytics {
  overview: ProjectOverview;
  flow: CumulativeFlow;
  control: ControlChartData;
  intake: CreatedVsResolved;
  throughput: Throughput;
  aging: AgingWip;
  workload: Workload;
  epics: EpicProgress;
}

export default function AnalyticsPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [days, setDays] = useState(30);

  const [data, setData] = useState<ProjectAnalytics | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [velocity, setVelocity] = useState<Velocity | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintId, setSprintId] = useState<number | null>(null);
  const [burndown, setBurndown] = useState<Burndown | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    void (async () => {
      try {
        const response = await projectAPI.getAll({ limit: 100 });
        const items = response.data as Project[];
        setProjects(items);
        setProjectId((current) => current ?? items[0]?.project_id ?? null);
      } catch (caught) {
        setError(describeRequestFailure(caught, 'Could not load projects.'));
        setLoading(false);
      }
    })();
  }, [token, router]);

  const loadProjectAnalytics = useCallback(async (id: number, windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const [overview, flow, control, intake, throughput, aging, workload, epics] = await Promise.all([
        analyticsAPI.overview(id, windowDays),
        analyticsAPI.cumulativeFlow(id, windowDays),
        analyticsAPI.controlChart(id, Math.max(windowDays, 30)),
        analyticsAPI.createdVsResolved(id, windowDays),
        analyticsAPI.throughput(id, Math.max(windowDays, 28)),
        analyticsAPI.agingWip(id),
        analyticsAPI.workload(id),
        analyticsAPI.epicProgress(id),
      ]);
      setData({
        overview: overview.data,
        flow: flow.data,
        control: control.data,
        intake: intake.data,
        throughput: throughput.data,
        aging: aging.data,
        workload: workload.data,
        epics: epics.data,
      });
    } catch (caught) {
      setError(describeRequestFailure(caught, 'Could not load analytics for this project.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectId === null) return;
    void loadProjectAnalytics(projectId, days);
  }, [projectId, days, loadProjectAnalytics]);

  // Boards and sprints drive the two charts that are scoped to a delivery cadence
  // rather than to the project as a whole.
  useEffect(() => {
    if (projectId === null) return;
    void (async () => {
      try {
        const response = await boardAPI.getByProject(projectId);
        const items = response.data as Board[];
        setBoards(items);
        setBoardId(items[0]?.board_id ?? null);
      } catch {
        setBoards([]);
        setBoardId(null);
      }
    })();
  }, [projectId]);

  useEffect(() => {
    if (boardId === null) {
      setVelocity(null);
      setSprints([]);
      setSprintId(null);
      return;
    }
    void (async () => {
      try {
        const [velocityResponse, sprintResponse] = await Promise.all([
          analyticsAPI.velocity(boardId),
          boardAPI.getSprints(boardId),
        ]);
        setVelocity(velocityResponse.data);
        const items = (sprintResponse.data as Sprint[]) ?? [];
        setSprints(items);
        const active = items.find((sprint) => sprint.sprint_status === 'active') ?? items[items.length - 1];
        setSprintId(active?.sprint_id ?? null);
      } catch {
        setVelocity(null);
        setSprints([]);
        setSprintId(null);
      }
    })();
  }, [boardId]);

  useEffect(() => {
    if (sprintId === null) {
      setBurndown(null);
      return;
    }
    void (async () => {
      try {
        const response = await analyticsAPI.burndown(sprintId);
        setBurndown(response.data);
      } catch {
        setBurndown(null);
      }
    })();
  }, [sprintId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.project_id === projectId) ?? null,
    [projects, projectId],
  );

  return (
    <div className="space-y-6">
      <section className="hero-panel rounded p-6">
        <p className="eyebrow text-sky-600">Delivery analytics</p>
        <h2 className="app-title mt-2 text-3xl font-semibold text-slate-950">Flow and throughput</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Cycle time, cumulative flow, intake against completion, and sprint burndown — computed from recorded
          status transitions rather than point-in-time snapshots.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            Project
            <select
              value={projectId ?? ''}
              onChange={(event) => setProjectId(Number(event.target.value))}
              className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {projects.map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.project_key} · {project.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1 rounded-sm border border-slate-300 bg-white p-1">
            {WINDOWS.map((option) => (
              <button
                key={option.days}
                onClick={() => setDays(option.days)}
                className={`rounded-sm px-3 py-1.5 text-xs font-medium transition ${
                  days === option.days ? 'bg-[color:var(--accent)] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {boards.length > 0 ? (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Board
              <select
                value={boardId ?? ''}
                onChange={(event) => setBoardId(Number(event.target.value))}
                className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {boards.map((board) => (
                  <option key={board.board_id} value={board.board_id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {sprints.length > 0 ? (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Sprint
              <select
                value={sprintId ?? ''}
                onChange={(event) => setSprintId(Number(event.target.value))}
                className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {sprints.map((sprint) => (
                  <option key={sprint.sprint_id} value={sprint.sprint_id}>
                    {sprint.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-sm border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading && !data ? (
        <div className="glass-panel rounded px-6 py-16 text-center text-sm text-slate-500">
          Loading analytics…
        </div>
      ) : null}

      {data ? (
        <>
          <OverviewTiles data={data.overview} />

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <CumulativeFlowChart data={data.flow} />
            </div>
            <StatusBreakdown data={data.workload} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ControlChart data={data.control} />
            </div>
            <AgingWipTable data={data.aging} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <CreatedVsResolvedChart data={data.intake} />
            <OpenBacklogChart data={data.intake} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ThroughputChart data={data.throughput} />
            <WorkloadChart data={data.workload} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {burndown ? <BurndownChart data={burndown} /> : null}
            {velocity ? <VelocityChart data={velocity} /> : null}
          </div>

          <EpicProgressList data={data.epics} />
        </>
      ) : null}

      {!loading && !data && !error && selectedProject === null ? (
        <div className="glass-panel rounded px-6 py-16 text-center text-sm text-slate-500">
          Create a project to start seeing delivery analytics.
        </div>
      ) : null}
    </div>
  );
}
