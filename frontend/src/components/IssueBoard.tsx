'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Board, BoardColumn, Issue } from '@/types';
import { BoardColumn as BoardColumnComponent } from '@/components/BoardColumn';
import { IssueComposerModal } from '@/components/IssueComposerModal';
import { boardAPI, issueAPI } from '@/lib/api';
import { PencilIcon, PlusIcon } from '@heroicons/react/24/outline';

interface IssueBoardProps {
  projectId: number;
  projectKey: string;
  boardId: number;
}

export const IssueBoard: React.FC<IssueBoardProps> = ({ projectId, projectKey, boardId }) => {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [issuesByColumn, setIssuesByColumn] = useState<Record<number, Issue[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const fetchBoardData = async () => {
    setIsLoading(true);
    try {
      const [columnsRes, issuesRes] = await Promise.all([
        boardAPI.getColumns(boardId),
        boardAPI.getIssues(boardId),
      ]);

      const columnsData = columnsRes.data as BoardColumn[];
      const boardData = (await boardAPI.getById(boardId)).data as Board;
      const issuesData = (issuesRes.data as any[]).flatMap((item) => item.issues);

      setBoard(boardData);
      setColumns(columnsData);

      const grouped: Record<number, Issue[]> = {};
      columnsData.forEach((col) => {
        grouped[col.column_id] = [];
      });

      issuesData.forEach((issue) => {
        const col = columnsData.find((column) => column.mapped_status_id === issue.status_id);
        if (col) {
          grouped[col.column_id].push(issue);
        }
      });

      setIssuesByColumn(grouped);
    } catch (error) {
      console.error('Failed to fetch board data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (boardId) {
      fetchBoardData();
    }
  }, [boardId]);

  const handleIssueClick = (issue: Issue) => {
    router.push(`/issues/${issue.issue_id}`);
  };

  const handleDrop = async (issueId: number, columnId: number) => {
    const column = columns.find((item) => item.column_id === columnId);
    if (!column || !column.mapped_status_id) return;

    try {
      await issueAPI.update(issueId, { status: column.status_name as any });
      await fetchBoardData();
    } catch (error) {
      console.error('Failed to move issue:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading board...</div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="glass-panel rounded-[1.8rem] p-8 text-center">
        <h3 className="text-lg font-medium text-slate-900">Board not found</h3>
        <p className="mt-2 text-slate-500">This board may have been deleted or you don&apos;t have access.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-slate-200/80 bg-white/80 px-6 py-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow text-emerald-600">Execution board</p>
            <h2 className="app-title mt-2 text-xl font-bold text-slate-900">{board.name}</h2>
            {board.description ? (
              <p className="mt-2 text-sm text-slate-500">{board.description}</p>
            ) : null}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsComposerOpen(true)}
              className="button-primary inline-flex items-center rounded-sm px-4 py-3 text-sm font-semibold text-white"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Issue
            </button>
            <button className="rounded-sm border border-slate-200 bg-white p-3 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700">
              <PencilIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex h-full gap-4" style={{ minWidth: 'fit-content' }}>
          {columns.map((column) => (
            <div key={column.column_id} className="flex-1 min-w-80 max-w-96">
              <BoardColumnComponent
                column={{
                  ...column,
                  issues: issuesByColumn[column.column_id] || [],
                }}
                onIssueClick={handleIssueClick}
                onDrop={handleDrop}
              />
            </div>
          ))}
        </div>
      </div>
      {isComposerOpen ? (
        <IssueComposerModal
          projectKey={projectKey}
          onClose={() => setIsComposerOpen(false)}
          onCreated={fetchBoardData}
        />
      ) : null}
    </div>
  );
};
