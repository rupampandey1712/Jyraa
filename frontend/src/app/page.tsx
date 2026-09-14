'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowTrendingUpIcon,
  FolderIcon,
  PlusCircleIcon,
  RectangleGroupIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/lib/auth-context';
import { boardAPI, projectAPI } from '@/lib/api';
import { Board, Project } from '@/types';

type ProjectStats = {
  total_issues: number;
  completed_issues: number;
  open_issues: number;
  total_estimate: number;
  total_time_spent: number;
};

type ProjectSnapshot = Project & {
  boards: Board[];
  stats: ProjectStats;
};

type RecentBoard = Board & {
  projectName: string;
  projectKey: string;
};

export default function HomePage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    void fetchWorkspace();
  }, [token, router]);

  const fetchWorkspace = async () => {
    setIsLoading(true);
    try {
      const response = await projectAPI.getAll();
      const projectList = response.data as Project[];

      const hydrated = await Promise.all(
        projectList.map(async (project) => {
          const [boardsResult, statsResult] = await Promise.allSettled([
            boardAPI.getByProject(project.project_id),
            projectAPI.getStats(project.project_id),
          ]);

          const boards =
            boardsResult.status === 'fulfilled' ? (boardsResult.value.data as Board[]) : [];
          const stats =
            statsResult.status === 'fulfilled'
              ? (statsResult.value.data as ProjectStats)
              : {
                  total_issues: 0,
                  completed_issues: 0,
                  open_issues: 0,
                  total_estimate: 0,
                  total_time_spent: 0,
                };

          return {
            ...project,
            boards,
            stats,
          };
        })
      );

      setProjects(hydrated);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totals = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.projects += 1;
        acc.boards += project.boards.length;
        acc.issues += project.stats.total_issues || 0;
        acc.completed += project.stats.completed_issues || 0;
        return acc;
      },
      { projects: 0, boards: 0, issues: 0, completed: 0 }
    );
  }, [projects]);

  const recentBoards = useMemo<RecentBoard[]>(() => {
    return projects
      .flatMap((project) =>
        project.boards.map((board) => ({
          ...board,
          projectName: project.name,
          projectKey: project.project_key,
        }))
      )
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 6);
  }, [projects]);

  const topProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => (b.stats.open_issues || 0) - (a.stats.open_issues || 0))
      .slice(0, 4);
  }, [projects]);

  const statCards = [
    {
      label: 'Active projects',
      value: totals.projects,
    },
    {
      label: 'Boards in motion',
      value: totals.boards,
    },
    {
      label: 'Tracked issues',
      value: totals.issues,
    },
    {
      label: 'Completed items',
      value: totals.completed,
    },
  ];

  if (!token) {
    return null;
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="glass-panel overflow-hidden rounded px-7 py-8">
          <p className="eyebrow">
            Welcome back
          </p>
          <h2 className="app-title mt-4 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
            {user?.display_name || user?.username || 'Your team'} can run delivery from one smoother workspace.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
            Dashboards should feel like an operational cockpit, not just a landing page. Use this view to jump into boards,
            scan delivery pressure, and move between modules without losing your place.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => router.push('/projects/new')}
              className="button-primary inline-flex items-center gap-2 rounded-sm px-4 py-3 text-sm font-semibold"
            >
              <PlusCircleIcon className="h-5 w-5" />
              Create project
            </button>
            <button
              onClick={() => router.push('/boards')}
              className="button-secondary inline-flex items-center gap-2 rounded-sm px-4 py-3 text-sm font-semibold"
            >
              <RectangleGroupIcon className="h-5 w-5" />
              Open boards
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="metric-card rounded p-5"
            >
              <p className="text-sm font-medium text-slate-600">{card.label}</p>
              <p className="mt-4 text-3xl font-semibold text-slate-950">{card.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="glass-panel rounded p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow text-sky-600">Project pulse</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Where delivery pressure is highest</h3>
            </div>
            <Link href="/projects" className="text-sm font-semibold text-sky-700 hover:text-sky-600">
              View all projects
            </Link>
          </div>

          <div className="mt-6 grid gap-4">
            {isLoading ? (
              <div className="rounded border border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                Building your dashboard...
              </div>
            ) : topProjects.length === 0 ? (
              <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                <FolderIcon className="mx-auto h-10 w-10 text-slate-400" />
                <h4 className="mt-4 text-lg font-semibold text-slate-900">No projects yet</h4>
                <p className="mt-2 text-sm text-slate-600">Create your first project to bring boards, issues, and dashboards to life.</p>
                <button
                  onClick={() => router.push('/projects/new')}
                  className="button-primary mt-5 inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold"
                >
                  <PlusCircleIcon className="h-5 w-5" />
                  Create project
                </button>
              </div>
            ) : (
              topProjects.map((project) => {
                const completion =
                  project.stats.total_issues > 0
                    ? Math.round((project.stats.completed_issues / project.stats.total_issues) * 100)
                    : 0;

                return (
                  <button
                    key={project.project_id}
                    onClick={() => router.push(`/projects/${project.project_id}`)}
                    className="interactive-card soft-panel rounded p-5 text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                            {project.project_key}
                          </span>
                          <span className="text-xs text-slate-500">{project.boards.length} boards</span>
                        </div>
                        <h4 className="mt-3 text-lg font-semibold text-slate-950">{project.name}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {project.description || 'A focused delivery space ready for planning, execution, and issue flow.'}
                        </p>
                      </div>
                      <ArrowTrendingUpIcon className="h-5 w-5 text-slate-400" />
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-sm bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Open</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{project.stats.open_issues || 0}</p>
                      </div>
                      <div className="rounded-sm bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Completed</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{project.stats.completed_issues || 0}</p>
                      </div>
                      <div className="rounded-sm bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Progress</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{completion}%</p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">Board access</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">Jump back into execution</h3>
              </div>
              <Link href="/boards" className="text-sm font-semibold text-emerald-700 hover:text-emerald-600">
                All boards
              </Link>
            </div>

            <div className="mt-6 space-y-3">
              {isLoading ? (
                <div className="soft-panel rounded px-5 py-8 text-center text-sm text-slate-500">
                  Loading boards...
                </div>
              ) : recentBoards.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">
                  No boards yet. Create a project and add your first board to make the dashboard feel alive.
                </div>
              ) : (
                recentBoards.map((board) => (
                  <button
                    key={board.board_id}
                    onClick={() => router.push(`/boards/${board.board_id}`)}
                    className="interactive-card soft-panel flex w-full items-center justify-between rounded-sm px-4 py-4 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{board.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {board.projectKey} | {board.projectName}
                      </p>
                    </div>
                    <span className="ado-pill">
                      {board.board_type}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="glass-panel rounded p-6">
            <p className="eyebrow text-violet-600">Module launcher</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Move through ZYRAA without friction</h3>
            <div className="mt-6 grid gap-3">
              {[
                {
                  href: '/projects',
                  title: 'Projects',
                  copy: 'Open scopes, owners, and team-specific workspaces.',
                },
                {
                  href: '/boards',
                  title: 'Boards',
                  copy: 'Switch into active delivery boards and workflow lanes.',
                },
                {
                  href: '/projects/new',
                  title: 'Create project',
                  copy: 'Spin up a fresh project structure without leaving the dashboard.',
                },
              ].map((module) => (
                <Link
                  key={module.href}
                  href={module.href}
                  className="interactive-card soft-panel rounded-sm px-4 py-4"
                >
                  <p className="text-sm font-semibold text-slate-950">{module.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{module.copy}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
