'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { boardAPI, projectAPI } from '@/lib/api';
import { IssueComposerModal } from '@/components/IssueComposerModal';
import { ArrowLeftIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Board, Issue, Project } from '@/types';
import { useAuth } from '@/lib/auth-context';

type ProjectStats = {
  total_issues: number;
  completed_issues: number;
  open_issues: number;
  total_estimate: number;
  total_time_spent: number;
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const rawProjectId = Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId;
  const projectId = Number.parseInt(rawProjectId || '0', 10);

  const [project, setProject] = useState<Project | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isIssueComposerOpen, setIsIssueComposerOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    if (Number.isNaN(projectId) || projectId <= 0) {
      setError('Invalid project id');
      setIsLoading(false);
      return;
    }

    if (projectId) {
      void fetchProject();
    }
  }, [projectId, token, router]);

  const fetchProject = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [projectRes, boardRes, statsRes, issuesRes] = await Promise.allSettled([
        projectAPI.getById(projectId),
        boardAPI.getByProject(projectId),
        projectAPI.getStats(projectId),
        projectAPI.getIssues(projectId),
      ]);

      if (projectRes.status !== 'fulfilled') {
        console.error('Failed to fetch project details:', projectRes.reason);
        setError('Project not found');
        setProject(null);
        return;
      }

      setProject(projectRes.value.data as Project);

      if (boardRes.status === 'fulfilled') {
        setBoards(boardRes.value.data as Board[]);
      } else {
        console.error('Failed to fetch project boards:', boardRes.reason);
        setBoards([]);
      }

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data as ProjectStats);
      } else {
        console.error('Failed to fetch project stats:', statsRes.reason);
        setStats({
          total_issues: 0,
          completed_issues: 0,
          open_issues: 0,
          total_estimate: 0,
          total_time_spent: 0,
        });
      }

      if (issuesRes.status === 'fulfilled') {
        setIssues(issuesRes.value.data as Issue[]);
      } else {
        console.error('Failed to fetch project issues:', issuesRes.reason);
        setIssues([]);
      }
    } catch (error: any) {
      console.error('Unexpected project detail failure:', error);
      setError(error?.response?.data?.detail || 'Project not found');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBoard = () => {
    router.push(`/projects/${projectId}/boards/new`);
  };

  const handleIssueCreated = async () => {
    await fetchProject();
  };

  if (isLoading) {
    return (
      <div className="rounded border border-slate-200 bg-white/85 px-6 py-16 text-center text-sm text-slate-500 shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
        Loading project...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 px-6 py-16 text-center text-sm font-medium text-rose-700">
        {error || 'Project not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button
              onClick={() => router.push('/projects')}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to projects
            </button>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold text-slate-950">{project.name}</h2>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                {project.project_key}
              </span>
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
              {project.description || 'This project is ready for boards, issues, and cross-team execution planning.'}
            </p>
          </div>

          <button
            onClick={handleCreateBoard}
            className="inline-flex items-center justify-center rounded-sm bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Board
          </button>
          <button
            onClick={() => setIsIssueComposerOpen(true)}
            className="inline-flex items-center justify-center rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Issue
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Project health</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              { label: 'Total issues', value: stats?.total_issues || 0 },
              { label: 'Open issues', value: stats?.open_issues || 0 },
              { label: 'Completed', value: stats?.completed_issues || 0 },
              { label: 'Hours logged', value: stats?.total_time_spent || 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-sm bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-600">Boards</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Execution spaces</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {boards.length} total
            </span>
          </div>

          {boards.length === 0 ? (
            <div className="mt-6 rounded border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <h4 className="text-lg font-semibold text-slate-900">No boards yet</h4>
              <p className="mt-2 text-sm text-slate-600">Create a board to turn this project into a living workflow.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {boards.map((board) => (
                <Link
                  key={board.board_id}
                  href={`/boards/${board.board_id}`}
                  className="rounded-sm border border-slate-200 bg-slate-50 px-5 py-4 transition hover:bg-white hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{board.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {board.description || 'Open this board to manage issue flow, status changes, and team execution.'}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                      {board.board_type}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-600">Issue workspace</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Issues inside this project</h3>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            {issues.length} total
          </span>
        </div>

        {issues.length === 0 ? (
          <div className="mt-6 rounded border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <h4 className="text-lg font-semibold text-slate-900">No issues yet</h4>
            <p className="mt-2 text-sm text-slate-600">
              Create your first issue here to capture the description, discuss it in comments, and log worked hours.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {issues.map((issue) => (
              <button
                key={issue.issue_id}
                onClick={() => router.push(`/issues/${issue.issue_id}`)}
                className="rounded-sm border border-slate-200 bg-slate-50 px-5 py-4 text-left transition hover:bg-white hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                        {issue.issue_key}
                      </span>
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                        {issue.issue_type}
                      </span>
                      {issue.priority ? (
                        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                          {issue.priority}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-950">{issue.summary}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {issue.description || 'No issue description yet.'}
                    </p>
                  </div>
                  <div className="text-right text-sm text-slate-500">
                    <p>{issue.status}</p>
                    <p className="mt-1">{issue.assignee_username || issue.assignee_name || 'Unassigned'}</p>
                    <p className="mt-1">{issue.time_spent || 0}h logged</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {isIssueComposerOpen ? (
        <IssueComposerModal
          projectKey={project.project_key}
          onClose={() => setIsIssueComposerOpen(false)}
          onCreated={handleIssueCreated}
        />
      ) : null}

    </div>
  );
}
