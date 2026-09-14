'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { boardAPI, projectAPI } from '@/lib/api';
import { Project } from '@/types';
import { useAuth } from '@/lib/auth-context';

type BoardType = 'kanban' | 'scrum';

const defaultColumns: Record<BoardType, Array<{ name: string; mapped_status_name: string; sort_order: number }>> = {
  kanban: [
    { name: 'To Do', mapped_status_name: 'To Do', sort_order: 1 },
    { name: 'In Progress', mapped_status_name: 'In Progress', sort_order: 2 },
    { name: 'In Review', mapped_status_name: 'In Review', sort_order: 3 },
    { name: 'Done', mapped_status_name: 'Done', sort_order: 4 },
  ],
  scrum: [
    { name: 'Backlog', mapped_status_name: 'To Do', sort_order: 1 },
    { name: 'In Progress', mapped_status_name: 'In Progress', sort_order: 2 },
    { name: 'Review', mapped_status_name: 'In Review', sort_order: 3 },
    { name: 'Done', mapped_status_name: 'Done', sort_order: 4 },
  ],
};

export default function CreateBoardPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const projectId = parseInt((params?.projectId as string) || '0', 10);

  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [boardType, setBoardType] = useState<BoardType>('kanban');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    if (projectId) {
      void fetchProject();
    }
  }, [projectId, token, router]);

  const typeCopy = useMemo(() => {
    return boardType === 'kanban'
      ? 'A continuous flow board for teams that prioritize visibility and steady movement.'
      : 'A sprint-friendly board for planning, tracking, and closing structured work cycles.';
  }, [boardType]);

  const fetchProject = async () => {
    setIsLoading(true);
    try {
      const response = await projectAPI.getById(projectId);
      const projectData = response.data as Project;
      setProject(projectData);
      setName(`${projectData.name} ${projectData.project_type === 'software' ? 'Delivery' : 'Board'}`);
    } catch (fetchError) {
      console.error('Failed to fetch project:', fetchError);
      setError('Project not found');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!project) {
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      const boardResponse = await boardAPI.create({
        project_key: project.project_key,
        name,
        description: description || undefined,
        board_type: boardType,
      });

      const board = boardResponse.data as { board_id: number };

      await Promise.all(
        defaultColumns[boardType].map((column) =>
          boardAPI.addColumn(board.board_id, {
            name: column.name,
            column_type: 'status',
            mapped_status_name: column.mapped_status_name,
            sort_order: column.sort_order,
            is_editable: true,
          })
        )
      );

      router.push(`/boards/${board.board_id}`);
    } catch (saveError: any) {
      console.error('Failed to create board:', saveError);
      setError(saveError.response?.data?.detail || 'Failed to create board');
      setIsSaving(false);
    }
  };

  if (!token) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="rounded border border-slate-200 bg-white/85 px-6 py-16 text-center text-sm text-slate-500 shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
        Loading project...
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 px-6 py-16 text-center text-sm font-medium text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="hero-panel rounded p-6 sm:p-8">
        <button
          onClick={() => router.push(`/projects/${projectId}`)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to project
        </button>

        <p className="eyebrow mt-6 text-emerald-600">
          Board setup
        </p>
        <h2 className="app-title mt-2 text-3xl font-semibold text-slate-950">Create a board for {project?.name}</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Start with a clean workflow structure. ZYRAA will add sensible default columns so the board is useful immediately.
        </p>

        {error && project ? (
          <div className="mt-6 rounded-sm border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Board name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
              placeholder="e.g. Platform Delivery Board"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
              placeholder="Describe who uses this board and what it should make visible."
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-slate-700">Board type</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {(['kanban', 'scrum'] as BoardType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBoardType(type)}
                  className={`rounded border p-5 text-left transition ${
                    boardType === type
                      ? 'border-slate-950 bg-slate-950 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]'
                      : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-white'
                  }`}
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.18em]">{type}</p>
                  <p className={`mt-3 text-sm leading-6 ${boardType === type ? 'text-slate-200' : 'text-slate-600'}`}>
                    {type === 'kanban'
                      ? 'Optimized for continuous flow and ongoing prioritization.'
                      : 'Optimized for sprint-based planning and focused execution windows.'}
                  </p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">{typeCopy}</p>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 px-5 py-5">
            <p className="text-sm font-semibold text-slate-900">Default columns that will be created</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {defaultColumns[boardType].map((column) => (
                <span
                  key={`${boardType}-${column.name}`}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-sm"
                >
                  {column.name}
                </span>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving || !name.trim()}
            className="button-primary inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Creating board...' : 'Create board'}
          </button>
        </form>
      </div>
    </div>
  );
}
