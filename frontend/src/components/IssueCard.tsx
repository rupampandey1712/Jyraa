'use client';

import React from 'react';
import { Issue } from '@/types';
import {ClockIcon} from '@heroicons/react/24/outline';

interface IssueCardProps {
  issue: Issue;
  onClick?: () => void;
}

export const IssueCard: React.FC<IssueCardProps> = ({ issue, onClick }) => {
  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'Highest': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'High': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Low': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Lowest': return 'bg-sky-100 text-sky-700 border-sky-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getIssueTypeIcon = (type: string) => {
    switch (type) {
      case 'Epic': return 'E';
      case 'Story': return 'S';
      case 'Task': return 'T';
      case 'Bug': return 'B';
      default: return 'I';
    }
  };

  return (
    <div
      className="interactive-card mb-2 cursor-pointer rounded-[1.2rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,253,0.9))] p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.07)]"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-slate-900 text-[0.68rem] font-bold text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
            {getIssueTypeIcon(issue.issue_type)}
          </span>
          <div>
            <span className="text-sm font-semibold text-slate-900">{issue.issue_key}</span>
            <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">{issue.issue_type}</p>
          </div>
        </div>
        {issue.priority && (
          <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${getPriorityColor(issue.priority)}`}>
            {issue.priority}
          </span>
        )}
      </div>

      <h4 className="mt-3 text-sm font-medium leading-6 text-slate-900 line-clamp-3">{issue.summary}</h4>

      {issue.epic_issue_key ? (
        <div className="mt-3 inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
          {issue.epic_issue_key}
        </div>
      ) : null}

      {(issue.assignee_name || issue.assignee_username) && (
        <div className="flex items-center gap-2 mt-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0f6cbd,#0f9d7a)] text-xs font-medium text-white">
            {(issue.assignee_name || issue.assignee_username || '').charAt(0).toUpperCase()}
          </div>
          <p className="text-xs font-medium text-slate-500">{issue.assignee_name || issue.assignee_username}</p>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        {issue.due_date && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <ClockIcon className="h-3 w-3" />
            {new Date(issue.due_date).toLocaleDateString()}
          </div>
        )}
        {issue.time_spent > 0 && (
          <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
            {issue.time_spent}h
          </div>
        )}
      </div>
    </div>
  );
};
