'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { boardAPI, dashboardAPI, projectAPI } from '@/lib/api';
import { Board, Dashboard, Project } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { GADGET_DEFINITIONS, GadgetRenderer, gadgetDefinition, parseGadgetConfig } from '@/components/analytics/gadgets';

/** Column span on the 12-column grid, mapped to the Tailwind classes it needs. */
const SPAN_CLASS: Record<number, string> = {
  4: 'xl:col-span-4',
  6: 'xl:col-span-6',
  8: 'xl:col-span-8',
  12: 'xl:col-span-12',
};

export default function DashboardsPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selected, setSelected] = useState<Dashboard | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);

  const [name, setName] = useState('Delivery cockpit');
  const [description, setDescription] = useState('Flow, throughput, and sprint health for the team.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboards = useCallback(async (preferredId?: number) => {
    const response = await dashboardAPI.getAll();
    const items = response.data as Dashboard[];
    setDashboards(items);
    const target = preferredId ?? items[0]?.dashboard_id;
    if (target) {
      const detail = await dashboardAPI.getById(target);
      setSelected(detail.data as Dashboard);
    } else {
      setSelected(null);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    void (async () => {
      try {
        const [projectResponse] = await Promise.all([projectAPI.getAll({ limit: 100 })]);
        const items = projectResponse.data as Project[];
        setProjects(items);
        setProjectId(items[0]?.project_id ?? null);
        await loadDashboards();
      } catch {
        setError('Could not load dashboards.');
      }
    })();
  }, [token, router, loadDashboards]);

  // Board-scoped gadgets need a board from the project the user picked.
  useEffect(() => {
    if (projectId === null) {
      setBoards([]);
      setBoardId(null);
      return;
    }
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

  const createDashboard = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await dashboardAPI.create({ name, description, is_shared: true, layout_config: '{}' });
      const dashboard = response.data as Dashboard;
      // A new dashboard opens with the overview and flow gadgets rather than empty.
      if (projectId !== null) {
        for (const type of ['overview', 'cumulative_flow', 'status_breakdown'] as const) {
          const definition = gadgetDefinition(type)!;
          await dashboardAPI.addGadget(dashboard.dashboard_id, {
            gadget_type: type,
            title: definition.label,
            config: JSON.stringify({ project_id: projectId, days: 30 }),
            width: definition.span,
            height: 4,
          });
        }
      }
      await loadDashboards(dashboard.dashboard_id);
    } catch {
      setError('Could not create the dashboard.');
    } finally {
      setBusy(false);
    }
  };

  const addGadget = async (type: string) => {
    if (!selected) return;
    const definition = gadgetDefinition(type);
    if (!definition) return;

    if (definition.scope === 'project' && projectId === null) {
      setError('Pick a project before adding this gadget.');
      return;
    }
    if (definition.scope === 'board' && boardId === null) {
      setError('This project has no board, so a board gadget cannot be added.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await dashboardAPI.addGadget(selected.dashboard_id, {
        gadget_type: type,
        title: definition.label,
        config: JSON.stringify(
          definition.scope === 'board' ? { board_id: boardId } : { project_id: projectId, days: 30 },
        ),
        width: definition.span,
        height: 4,
      });
      const detail = await dashboardAPI.getById(selected.dashboard_id);
      setSelected(detail.data as Dashboard);
    } catch {
      setError('Could not add the gadget.');
    } finally {
      setBusy(false);
    }
  };

  const removeGadget = async (gadgetId: number) => {
    if (!selected) return;
    await dashboardAPI.deleteGadget(selected.dashboard_id, gadgetId);
    const detail = await dashboardAPI.getById(selected.dashboard_id);
    setSelected(detail.data as Dashboard);
  };

  const gadgets = useMemo(() => selected?.gadgets ?? [], [selected]);

  return (
    <div className="space-y-6">
      <section className="hero-panel rounded p-6">
        <p className="eyebrow text-violet-600">Dashboards and gadgets</p>
        <h2 className="app-title mt-2 text-3xl font-semibold text-slate-950">Operational dashboards</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Compose a dashboard from live delivery gadgets. Each gadget stores the project or board it points at, so
          the view reloads with real data every time it opens.
        </p>
      </section>

      {error ? (
        <div className="rounded-sm border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <aside className="glass-panel rounded p-6">
          <p className="text-sm font-semibold text-slate-900">Create dashboard</p>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-4 w-full rounded-sm border border-slate-300 px-4 py-2.5 text-sm"
            placeholder="Dashboard name"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="mt-3 w-full rounded-sm border border-slate-300 px-4 py-2.5 text-sm"
            placeholder="What this dashboard is for"
          />
          <button
            onClick={() => void createDashboard()}
            disabled={busy}
            className="button-primary mt-4 w-full rounded-sm px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Working…' : 'Create'}
          </button>

          <div className="mt-8">
            <p className="eyebrow text-sky-600">Gadget scope</p>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Project
              <select
                value={projectId ?? ''}
                onChange={(event) => setProjectId(Number(event.target.value))}
                className="mt-1.5 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {projects.map((project) => (
                  <option key={project.project_id} value={project.project_id}>
                    {project.project_key} · {project.name}
                  </option>
                ))}
              </select>
            </label>
            {boards.length > 0 ? (
              <label className="mt-3 block text-xs font-medium text-slate-600">
                Board
                <select
                  value={boardId ?? ''}
                  onChange={(event) => setBoardId(Number(event.target.value))}
                  className="mt-1.5 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {boards.map((board) => (
                    <option key={board.board_id} value={board.board_id}>
                      {board.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="mt-8 space-y-3">
            <p className="eyebrow text-sky-600">Your dashboards</p>
            {dashboards.map((dashboard) => (
              <button
                key={dashboard.dashboard_id}
                onClick={async () => {
                  const detail = await dashboardAPI.getById(dashboard.dashboard_id);
                  setSelected(detail.data as Dashboard);
                }}
                className={`soft-panel block w-full rounded-sm px-4 py-3 text-left transition ${
                  selected?.dashboard_id === dashboard.dashboard_id ? 'ring-2 ring-sky-500/40' : ''
                }`}
              >
                <p className="text-sm font-semibold text-slate-950">{dashboard.name}</p>
                <p className="mt-1 text-xs text-slate-500">{dashboard.is_shared ? 'Shared' : 'Private'}</p>
              </button>
            ))}
            {dashboards.length === 0 ? (
              <p className="text-xs text-slate-500">No dashboards yet.</p>
            ) : null}
          </div>
        </aside>

        <main className="space-y-5">
          {selected ? (
            <>
              <div className="glass-panel rounded p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="eyebrow text-emerald-600">Selected dashboard</p>
                    <h3 className="mt-2 text-2xl font-semibold text-slate-950">{selected.name}</h3>
                    <p className="mt-2 text-sm text-slate-600">{selected.description}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-medium text-slate-500">Add a gadget</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {GADGET_DEFINITIONS.map((definition) => (
                      <button
                        key={definition.type}
                        onClick={() => void addGadget(definition.type)}
                        disabled={busy}
                        title={definition.description}
                        className="button-secondary rounded-sm px-3 py-2 text-xs font-semibold disabled:opacity-60"
                      >
                        {definition.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {gadgets.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 px-6 py-16 text-center text-sm text-slate-500">
                  This dashboard has no gadgets yet. Add one above.
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-12">
                  {gadgets.map((gadget) => {
                    const definition = gadgetDefinition(gadget.gadget_type);
                    const span = definition?.span ?? gadget.width ?? 6;
                    const config = parseGadgetConfig(gadget.config);
                    return (
                      <div key={gadget.gadget_id} className={`relative ${SPAN_CLASS[span] ?? 'xl:col-span-6'}`}>
                        <GadgetRenderer gadget={gadget} />
                        <button
                          onClick={() => void removeGadget(gadget.gadget_id)}
                          className="absolute right-4 top-4 rounded-sm border border-slate-200 bg-white/90 px-2 py-1 text-[0.68rem] font-semibold text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                          aria-label={`Remove ${gadget.title}`}
                          title={
                            config.board_id
                              ? `Board ${config.board_id}`
                              : config.project_id
                                ? `Project ${config.project_id}`
                                : 'Unscoped gadget'
                          }
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="glass-panel rounded px-6 py-16 text-center text-sm text-slate-500">
              Create a dashboard to start adding gadgets.
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
