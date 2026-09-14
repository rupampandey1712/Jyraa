'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { IssueBoard } from '@/components/IssueBoard';
import { boardAPI, projectAPI } from '@/lib/api';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Board, Project } from '@/types';
import { useAuth } from '@/lib/auth-context';

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const rawBoardId = Array.isArray(params?.boardId) ? params.boardId[0] : params?.boardId;
  const boardId = Number.parseInt(rawBoardId || '0', 10);

  const [board, setBoard] = useState<Board | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (Number.isNaN(boardId) || boardId <= 0) {
      setIsLoading(false);
      return;
    }
    void fetchData();
  }, [boardId, token, router]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const boardRes = await boardAPI.getById(boardId);
      const boardData = boardRes.data as Board;
      setBoard(boardData);

      const projectRes = await projectAPI.getById(boardData.project_id);
      const projectData = projectRes.data as Project;
      setProject(projectData);
    } catch (error) {
      console.error('Failed to fetch board:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded border border-slate-200 bg-white/85 px-6 py-16 text-center text-sm text-slate-500 shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
        Loading board...
      </div>
    );
  }

  if (!board || !project) {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 px-6 py-16 text-center text-sm font-medium text-rose-700">
        Board not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="hero-panel rounded p-6">
        <Link
          href={`/projects/${project.project_id}`}
          className="inline-flex items-center text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back to {project.name}
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h2 className="app-title text-3xl font-semibold text-slate-950">{board.name}</h2>
          <span className="rounded-full bg-[linear-gradient(135deg,#11213a,#0f3454)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
            {board.board_type}
          </span>
        </div>

        <p className="mt-4 text-sm leading-7 text-slate-600">
          {board.description || 'Move issues through the workflow, inspect bottlenecks, and keep execution visible.'}
        </p>
      </div>

      <div className="glass-panel h-[calc(100vh-17rem)] min-h-[42rem] rounded p-4 sm:p-6">
        <div className="h-full">
          <IssueBoard
            projectId={project.project_id}
            projectKey={project.project_key}
            boardId={board.board_id}
          />
        </div>
      </div>
    </div>
  );
}
