'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { boardAPI, projectAPI } from '@/lib/api';
import { Board, Project } from '@/types';
import { useAuth } from '@/lib/auth-context';

type BoardDirectoryItem = Board & {
  projectName: string;
  projectKey: string;
};

export default function BoardsPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [boards, setBoards] = useState<BoardDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    void fetchBoards();
  }, [token, router]);

  const fetchBoards = async () => {
    setIsLoading(true);
    try {
      const response = await projectAPI.getAll();
      const projects = response.data as Project[];
      const byProject = await Promise.all(
        projects.map(async (project) => {
          const boardResponse = await boardAPI.getByProject(project.project_id);
          return (boardResponse.data as Board[]).map((board) => ({
            ...board,
            projectName: project.name,
            projectKey: project.project_key,
          }));
        })
      );

      setBoards(byProject.flat());
    } catch (error) {
      console.error('Failed to fetch boards:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedBoards = useMemo(() => {
    return boards.reduce<Record<string, BoardDirectoryItem[]>>((acc, board) => {
      const key = `${board.projectKey}__${board.projectName}`;
      acc[key] = acc[key] || [];
      acc[key].push(board);
      return acc;
    }, {});
  }, [boards]);

  if (!token) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="hero-panel rounded p-6">
        <p className="eyebrow text-emerald-600">Board directory</p>
        <h2 className="app-title mt-2 text-3xl font-semibold text-slate-950">Boards</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Move between delivery boards quickly, grouped by project and styled as execution spaces instead of flat listings.
        </p>
      </div>

      {isLoading ? (
        <div className="glass-panel rounded px-6 py-16 text-center text-sm text-slate-500">
          Loading boards...
        </div>
      ) : boards.length === 0 ? (
        <div className="glass-panel rounded border border-dashed border-slate-300 px-6 py-16 text-center">
          <h3 className="text-lg font-semibold text-slate-900">No boards yet</h3>
          <p className="mt-2 text-sm text-slate-600">Create a project, then add a board to start coordinating delivery.</p>
          <button
            onClick={() => router.push('/projects/new')}
            className="button-primary mt-5 rounded-sm px-4 py-3 text-sm font-semibold text-white"
          >
            Create project
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {Object.entries(groupedBoards).map(([key, projectBoards]) => {
            const [projectKey, projectName] = key.split('__');
            return (
              <section key={key} className="glass-panel rounded p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="eyebrow text-sky-600">{projectKey}</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">{projectName}</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                    {projectBoards.length} boards
                  </span>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  {projectBoards.map((board) => (
                    <Link
                      key={board.board_id}
                      href={`/boards/${board.board_id}`}
                      className="interactive-card soft-panel rounded-sm px-5 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{board.name}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {board.description || 'Open this board to manage issue flow and workflow progress.'}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                          {board.board_type}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
