'use client';

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { issueAPI, userAPI } from '@/lib/api';
import { User } from '@/types';

type IssueComposerModalProps = {
  projectKey: string;
  onClose: () => void;
  onCreated: () => void;
  defaultIssueType?: 'Story' | 'Task' | 'Bug' | 'Epic';
  parentEpic?: {
    issue_key: string;
    summary: string;
  } | null;
};

const issueTypes = ['Story', 'Task', 'Bug', 'Epic'];
const priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
type ComposerIssueType = IssueComposerModalProps['defaultIssueType'];

const formatAssigneeLabel = (user: User) => `${user.display_name} (@${user.username})`;

export function IssueComposerModal({
  projectKey,
  onClose,
  onCreated,
  defaultIssueType = 'Story',
  parentEpic = null,
}: IssueComposerModalProps) {
  const [issueType, setIssueType] = useState<NonNullable<ComposerIssueType>>(defaultIssueType);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [labels, setLabels] = useState('');
  const [estimate, setEstimate] = useState('');
  const [autoAssign, setAutoAssign] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [assigneeResults, setAssigneeResults] = useState<User[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<User | null>(null);
  const [isSearchingAssignees, setIsSearchingAssignees] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setIssueType(defaultIssueType);
  }, [defaultIssueType]);

  useEffect(() => {
    if (autoAssign) {
      setAssigneeResults([]);
      setIsSearchingAssignees(false);
      return;
    }

    const search = assigneeQuery.trim();
    if (selectedAssignee && search === formatAssigneeLabel(selectedAssignee)) {
      return;
    }
    if (search.length < 2) {
      setAssigneeResults([]);
      setIsSearchingAssignees(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingAssignees(true);
      try {
        const response = await userAPI.search({ q: search, limit: 8 });
        setAssigneeResults(response.data as User[]);
      } catch (searchError) {
        console.error('Failed to search assignees:', searchError);
        setAssigneeResults([]);
      } finally {
        setIsSearchingAssignees(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [assigneeQuery, autoAssign, selectedAssignee]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      await issueAPI.create({
        project_key: projectKey,
        issue_type: issueType,
        summary,
        description: description || undefined,
        priority,
        assignee_username: autoAssign ? undefined : selectedAssignee?.username || undefined,
        auto_assign: autoAssign,
        epic_issue_key: issueType === 'Epic' ? undefined : parentEpic?.issue_key || undefined,
        due_date: dueDate || undefined,
        original_estimate: estimate ? Number(estimate) : undefined,
        remaining_estimate: estimate ? Number(estimate) : undefined,
        label_names: labels
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean),
      });
      onCreated();
      onClose();
    } catch (createError: any) {
      console.error('Failed to create issue:', createError);
      setError(createError?.response?.data?.detail || 'Failed to create issue');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAssignee = (user: User) => {
    setSelectedAssignee(user);
    setAssigneeQuery(formatAssigneeLabel(user));
    setAssigneeResults([]);
    setAutoAssign(false);
  };

  const handleAssigneeInputChange = (value: string) => {
    setAssigneeQuery(value);
    if (selectedAssignee && value !== formatAssigneeLabel(selectedAssignee)) {
      setSelectedAssignee(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="flex max-h-[min(92vh,58rem)] w-full max-w-2xl flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Create issue</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">Add work inside {projectKey}</h3>
            </div>
            <button onClick={onClose} className="rounded-sm p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
              <div className="space-y-5">
                {error ? (
                  <div className="rounded-sm border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {error}
                  </div>
                ) : null}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Issue type</label>
                    <select
                      value={issueType}
                      onChange={(event) => setIssueType(event.target.value as NonNullable<ComposerIssueType>)}
                      disabled={!!parentEpic}
                      className="mt-2 block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500"
                    >
                      {issueTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Priority</label>
                    <select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                      className="mt-2 block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500"
                    >
                      {priorities.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {parentEpic ? (
                  <div className="rounded border border-violet-200 bg-violet-50/80 p-4">
                    <p className="text-sm font-medium text-violet-900">Parent epic</p>
                    <p className="mt-2 text-sm font-semibold text-violet-800">{parentEpic.issue_key}</p>
                    <p className="mt-1 text-sm text-violet-700">{parentEpic.summary}</p>
                  </div>
                ) : null}

                <div className="rounded border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700">Assignee</label>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Search the team directory and choose a person, or let the assignment agent pick automatically.
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                        <input
                          type="checkbox"
                          checked={autoAssign}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setAutoAssign(checked);
                            if (checked) {
                              setSelectedAssignee(null);
                              setAssigneeQuery('');
                              setAssigneeResults([]);
                            }
                          }}
                          className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        Auto-assign with agent
                      </label>
                    </div>

                    <div className="relative">
                      <input
                        value={assigneeQuery}
                        onChange={(event) => handleAssigneeInputChange(event.target.value)}
                        disabled={autoAssign}
                        className="block w-full rounded-sm border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                        placeholder={autoAssign ? 'Agent will choose the best assignee' : 'Search by name, username, or email'}
                      />
                      {!autoAssign && assigneeResults.length > 0 ? (
                        <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-sm border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                          {assigneeResults.map((user) => (
                            <button
                              key={user.user_id}
                              type="button"
                              onClick={() => handleSelectAssignee(user)}
                              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                            >
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{user.display_name}</p>
                                <p className="text-xs text-slate-500">@{user.username} - {user.email}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {!autoAssign && isSearchingAssignees ? (
                      <p className="text-xs text-slate-500">Searching team members...</p>
                    ) : null}
                    {!autoAssign && selectedAssignee ? (
                      <p className="text-xs text-emerald-700">
                        Selected assignee: {selectedAssignee.display_name} (@{selectedAssignee.username})
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Summary</label>
                  <input
                    required
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    className="mt-2 block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500"
                    placeholder="Describe the issue in one clear line"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="mt-2 block min-h-[10rem] w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500"
                    placeholder="Add the problem statement, scope, expected behavior, and any acceptance notes."
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Due date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      className="mt-2 block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Original estimate (hours)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={estimate}
                      onChange={(event) => setEstimate(event.target.value)}
                      className="mt-2 block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500"
                      placeholder="e.g. 6"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Labels</label>
                  <input
                    value={labels}
                    onChange={(event) => setLabels(event.target.value)}
                    className="mt-2 block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500"
                    placeholder="frontend, auth, urgent"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !summary.trim()}
                  className="rounded-sm bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {isSaving ? 'Creating issue...' : 'Create issue'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
