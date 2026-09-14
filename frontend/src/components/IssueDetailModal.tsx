'use client';

import React, { useEffect, useState } from 'react';
import { Comment, Issue, User, Worklog } from '@/types';
import { issueAPI, userAPI } from '@/lib/api';
import { XMarkIcon, PencilIcon, PlusIcon } from '@heroicons/react/24/outline';

interface IssueDetailModalProps {
  issue: Issue;
  onClose: () => void;
  onUpdate: (updatedIssue?: Issue) => void | Promise<void>;
}

const issueTypes = ['Epic', 'Story', 'Task', 'Bug', 'Subtask'];
const priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const statuses = ['To Do', 'In Progress', 'In Review', 'Done', 'Cancelled'];

const formatAssigneeLabel = (user: User) => `${user.display_name} (@${user.username})`;

const buildDerivedEpic = (issue: Issue): Issue | null => {
  if (!issue.epic_issue_key) {
    return null;
  }

  return {
    issue_id: issue.epic_issue_id || 0,
    issue_key: issue.epic_issue_key,
    project_id: issue.project_id,
    project_key: issue.project_key,
    project_name: issue.project_name,
    issue_type: 'Epic',
    summary: issue.epic_issue_summary || issue.epic_issue_key,
    description: '',
    priority: issue.priority,
    status: issue.status,
    assignee_user_id: issue.assignee_user_id,
    assignee_name: issue.assignee_name,
    assignee_username: issue.assignee_username,
    assignee_avatar: issue.assignee_avatar,
    reporter_username: issue.reporter_username,
    reporter_display_name: issue.reporter_display_name,
    component_id: issue.component_id,
    component_name: issue.component_name,
    component_description: issue.component_description,
    version_id: issue.version_id,
    version_name: issue.version_name,
    version_released: issue.version_released,
    original_estimate: issue.original_estimate,
    remaining_estimate: issue.remaining_estimate,
    time_spent: issue.time_spent,
    due_date: issue.due_date,
    label_names: issue.label_names,
    epic_issue_id: undefined,
    epic_issue_key: undefined,
    epic_issue_summary: undefined,
    resolution: issue.resolution,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    recommendation: issue.recommendation,
  };
};

const formatDate = (value?: string | null) => {
  if (!value) return 'None';
  return new Date(value).toLocaleDateString();
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'None';
  return new Date(value).toLocaleString();
};

const formatHours = (value?: number | null) => {
  if (value === null || value === undefined) return 'None';
  return `${value}h`;
};

const getBadgeClasses = (kind: 'type' | 'status' | 'priority', value?: string | null) => {
  if (kind === 'type') {
    if (value === 'Epic') return 'bg-violet-100 text-violet-700';
    if (value === 'Story') return 'bg-emerald-100 text-emerald-700';
    if (value === 'Bug') return 'bg-rose-100 text-rose-700';
    if (value === 'Task') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  }

  if (kind === 'status') {
    if (value === 'Done') return 'bg-emerald-100 text-emerald-700';
    if (value === 'In Progress') return 'bg-sky-100 text-sky-700';
    if (value === 'In Review') return 'bg-amber-100 text-amber-700';
    if (value === 'Cancelled') return 'bg-rose-100 text-rose-700';
    return 'bg-slate-100 text-slate-700';
  }

  if (value === 'Highest' || value === 'High') return 'bg-rose-100 text-rose-700';
  if (value === 'Medium') return 'bg-amber-100 text-amber-700';
  if (value === 'Low' || value === 'Lowest') return 'bg-sky-100 text-sky-700';
  return 'bg-slate-100 text-slate-700';
};

const getInitials = (value?: string | null) => {
  if (!value) return '?';
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

export const IssueDetailModal: React.FC<IssueDetailModalProps> = ({ issue, onClose, onUpdate }) => {
  const [currentIssue, setCurrentIssue] = useState(issue);
  const [isEditing, setIsEditing] = useState(false);
  const [projectKey, setProjectKey] = useState(issue.project_key || '');
  const [issueType, setIssueType] = useState(issue.issue_type);
  const [status, setStatus] = useState(issue.status);
  const [priority, setPriority] = useState(issue.priority || '');
  const [summary, setSummary] = useState(issue.summary);
  const [description, setDescription] = useState(issue.description || '');
  const [componentName, setComponentName] = useState(issue.component_name || '');
  const [versionName, setVersionName] = useState(issue.version_name || '');
  const [originalEstimate, setOriginalEstimate] = useState(issue.original_estimate?.toString() || '');
  const [remainingEstimate, setRemainingEstimate] = useState(issue.remaining_estimate?.toString() || '');
  const [dueDate, setDueDate] = useState(issue.due_date ? issue.due_date.slice(0, 10) : '');
  const [labels, setLabels] = useState((issue.label_names || []).join(', '));
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState<User | null>(null);
  const [assigneeResults, setAssigneeResults] = useState<User[]>([]);
  const [isSearchingAssignees, setIsSearchingAssignees] = useState(false);
  const [epicQuery, setEpicQuery] = useState('');
  const [selectedEpic, setSelectedEpic] = useState<Issue | null>(null);
  const [epicResults, setEpicResults] = useState<Issue[]>([]);
  const [isSearchingEpics, setIsSearchingEpics] = useState(false);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [timeSpent, setTimeSpent] = useState('');
  const [worklogComment, setWorklogComment] = useState('');
  const [startedAt, setStartedAt] = useState(new Date().toISOString().slice(0, 16));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'worklogs'>('details');

  useEffect(() => {
    setCurrentIssue(issue);
    setProjectKey(issue.project_key || '');
    setIssueType(issue.issue_type);
    setStatus(issue.status);
    setPriority(issue.priority || '');
    setSummary(issue.summary);
    setDescription(issue.description || '');
    setComponentName(issue.component_name || '');
    setVersionName(issue.version_name || '');
    setOriginalEstimate(issue.original_estimate?.toString() || '');
    setRemainingEstimate(issue.remaining_estimate?.toString() || '');
    setDueDate(issue.due_date ? issue.due_date.slice(0, 10) : '');
    setLabels((issue.label_names || []).join(', '));
    setAssigneeQuery(issue.assignee_username || '');
    setSelectedAssignee(null);
    setAssigneeResults([]);
    setEpicQuery(issue.epic_issue_key ? `${issue.epic_issue_key} - ${issue.epic_issue_summary || ''}`.trim() : '');
    setSelectedEpic(buildDerivedEpic(issue));
    setEpicResults([]);
    setError('');
    setActiveTab('details');
    setComment('');
    setTimeSpent('');
    setWorklogComment('');
    setStartedAt(new Date().toISOString().slice(0, 16));
    setIsEditing(false);
  }, [issue]);

  useEffect(() => {
    void fetchComments();
    void fetchWorklogs();
  }, [currentIssue.issue_id]);

  useEffect(() => {
    const search = assigneeQuery.trim();
    if (!isEditing || search.length < 2) {
      setAssigneeResults([]);
      setIsSearchingAssignees(false);
      return;
    }
    if (selectedAssignee && search === formatAssigneeLabel(selectedAssignee)) {
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
  }, [assigneeQuery, isEditing, selectedAssignee]);

  useEffect(() => {
    const search = epicQuery.trim();
    if (!isEditing || !currentIssue.project_key || currentIssue.issue_type === 'Epic') {
      setEpicResults([]);
      setIsSearchingEpics(false);
      return;
    }
    if (search.length < 2) {
      setEpicResults([]);
      setIsSearchingEpics(false);
      return;
    }
    if (selectedEpic && search === `${selectedEpic.issue_key} - ${selectedEpic.summary}`) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingEpics(true);
      try {
        const response = await issueAPI.getAll({
          project_key: currentIssue.project_key,
          issue_type_name: 'Epic',
          search,
          limit: 8,
        });
        setEpicResults((response.data as Issue[]).filter((candidate) => candidate.issue_id !== currentIssue.issue_id));
      } catch (searchError) {
        console.error('Failed to search epics:', searchError);
        setEpicResults([]);
      } finally {
        setIsSearchingEpics(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [currentIssue.issue_id, currentIssue.issue_type, currentIssue.project_key, epicQuery, isEditing, selectedEpic]);

  const fetchComments = async () => {
    try {
      const res = await issueAPI.getComments(currentIssue.issue_id);
      setComments(res.data);
    } catch (fetchError) {
      console.error('Failed to fetch comments:', fetchError);
    }
  };

  const fetchWorklogs = async () => {
    try {
      const res = await issueAPI.getWorklogs(currentIssue.issue_id);
      setWorklogs(res.data);
    } catch (fetchError) {
      console.error('Failed to fetch worklogs:', fetchError);
    }
  };

  const handleSelectAssignee = (user: User) => {
    setSelectedAssignee(user);
    setAssigneeQuery(formatAssigneeLabel(user));
    setAssigneeResults([]);
  };

  const handleAssigneeInputChange = (value: string) => {
    setAssigneeQuery(value);
    if (selectedAssignee && value !== formatAssigneeLabel(selectedAssignee)) {
      setSelectedAssignee(null);
    }
  };

  const handleSelectEpic = (epic: Issue) => {
    setSelectedEpic(epic);
    setEpicQuery(`${epic.issue_key} - ${epic.summary}`);
    setEpicResults([]);
  };

  const handleEpicInputChange = (value: string) => {
    setEpicQuery(value);
    if (selectedEpic && value !== `${selectedEpic.issue_key} - ${selectedEpic.summary}`) {
      setSelectedEpic(null);
    }
  };

  const handleClearEpicSelection = () => {
    setSelectedEpic(null);
    setEpicQuery('');
    setEpicResults([]);
  };

  const handleUpdateIssue = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const response = await issueAPI.update(issue.issue_id, {
        project_key: projectKey.trim(),
        issue_type: issueType,
        summary,
        description,
        priority: priority || null,
        status,
        assignee_username: selectedAssignee?.username ?? (assigneeQuery.trim() || null),
        component_name: componentName.trim() || null,
        version_name: versionName.trim() || null,
        original_estimate: originalEstimate ? Number(originalEstimate) : undefined,
        remaining_estimate: remainingEstimate ? Number(remainingEstimate) : undefined,
        due_date: dueDate || null,
        label_names: labels.split(',').map((label: string) => label.trim()).filter(Boolean),
      });
      const updatedIssue = response.data as Issue;
      setCurrentIssue(updatedIssue);
      setEpicQuery(updatedIssue.epic_issue_key ? `${updatedIssue.epic_issue_key} - ${updatedIssue.epic_issue_summary || ''}`.trim() : '');
      setSelectedEpic(buildDerivedEpic(updatedIssue));
      setIsEditing(false);
      await onUpdate(updatedIssue);
    } catch (updateError: any) {
      console.error('Failed to update issue:', updateError);
      setError(updateError?.response?.data?.detail || 'Failed to update issue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setIsSubmitting(true);
    try {
      await issueAPI.addComment(currentIssue.issue_id, comment);
      setComment('');
      await fetchComments();
      setActiveTab('comments');
    } catch (commentError) {
      console.error('Failed to add comment:', commentError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddWorklog = async () => {
    if (!timeSpent || Number(timeSpent) <= 0) return;
    setIsSubmitting(true);
    try {
      await issueAPI.addWorklog(currentIssue.issue_id, {
        time_spent: Number(timeSpent),
        comment: worklogComment || undefined,
        started_at: new Date(startedAt).toISOString(),
      });
      setTimeSpent('');
      setWorklogComment('');
      setStartedAt(new Date().toISOString().slice(0, 16));
      await fetchWorklogs();
      await onUpdate();
      setActiveTab('worklogs');
    } catch (worklogError) {
      console.error('Failed to add worklog:', worklogError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleAddComment();
    }
  };

  const handleUpdateEpic = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const response = await issueAPI.updateEpic(currentIssue.issue_id, selectedEpic?.issue_key || null);
      const updatedIssue = response.data as Issue;
      setCurrentIssue(updatedIssue);
      setEpicQuery(updatedIssue.epic_issue_key ? `${updatedIssue.epic_issue_key} - ${updatedIssue.epic_issue_summary || ''}`.trim() : '');
      setSelectedEpic(buildDerivedEpic(updatedIssue));
      await onUpdate(updatedIssue);
    } catch (updateError: any) {
      console.error('Failed to update epic:', updateError);
      setError(updateError?.response?.data?.detail || 'Failed to update epic');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalTracked = (currentIssue.original_estimate || 0) + (currentIssue.remaining_estimate || 0) + (currentIssue.time_spent || 0);
  const trackedBase = totalTracked > 0 ? totalTracked : 1;
  const loggedWidth = `${Math.min(100, ((currentIssue.time_spent || 0) / trackedBase) * 100)}%`;
  const remainingWidth = `${Math.min(100, ((currentIssue.remaining_estimate || 0) / trackedBase) * 100)}%`;

  const detailFields = [
    { label: 'Type', content: currentIssue.issue_type },
    { label: 'Status', content: currentIssue.status },
    { label: 'Priority', content: currentIssue.priority || 'None' },
    { label: 'Project', content: currentIssue.project_key || 'None' },
    { label: 'Component', content: currentIssue.component_name || 'None' },
    { label: 'Fix version', content: currentIssue.version_name || 'None' },
    { label: 'Resolution', content: currentIssue.resolution || 'Unresolved' },
    { label: 'Epic link', content: currentIssue.issue_type === 'Epic' ? 'This issue is an epic' : (currentIssue.epic_issue_key ? `${currentIssue.epic_issue_key} - ${currentIssue.epic_issue_summary}` : 'None') },
  ];

  const tabButtonClass = (tab: typeof activeTab) =>
    `border-b-2 px-4 py-3 text-sm font-semibold transition ${
      activeTab === tab
        ? 'border-jira-blue text-jira-blue'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded border border-slate-200 bg-slate-50 shadow-[0_40px_120px_rgba(15,23,42,0.28)]">
        <div className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-700">
                  {currentIssue.project_key || 'Project'}
                </span>
                <span className="text-slate-400">/</span>
                <span className="font-semibold text-slate-700">{currentIssue.issue_key}</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getBadgeClasses('type', currentIssue.issue_type)}`}>
                  {currentIssue.issue_type}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getBadgeClasses('status', currentIssue.status)}`}>
                  {currentIssue.status}
                </span>
                {currentIssue.priority ? (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getBadgeClasses('priority', currentIssue.priority)}`}>
                    {currentIssue.priority}
                  </span>
                ) : null}
              </div>

              {isEditing ? (
                <input
                  type="text"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="mt-4 w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-2xl font-semibold text-slate-950 outline-none transition focus:border-sky-400"
                />
              ) : (
                <h2 className="mt-4 text-2xl font-semibold leading-tight text-slate-950 md:text-[2rem]">
                  {currentIssue.summary}
                </h2>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="rounded-sm border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateIssue}
                    disabled={isSubmitting}
                    className="rounded-sm bg-jira-blue px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    Save changes
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <PencilIcon className="mr-2 h-4 w-4" />
                  Edit
                </button>
              )}
              <button onClick={onClose} className="rounded-sm border border-slate-300 bg-white p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,2fr)_320px]">
            <div className="space-y-6">
              {error ? (
                <div className="rounded-sm border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {error}
                </div>
              ) : null}

              <section className="rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-lg font-semibold text-slate-950">Details</h3>
                </div>

                {isEditing ? (
                  <div className="grid gap-4 p-5 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Project</label>
                      <input
                        value={projectKey}
                        onChange={(event) => setProjectKey(event.target.value.toUpperCase())}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Issue type</label>
                      <select
                        value={issueType}
                        onChange={(event) => setIssueType(event.target.value as Issue['issue_type'])}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      >
                        {issueTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Status</label>
                      <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as Issue['status'])}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      >
                        {statuses.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Priority</label>
                      <select
                        value={priority}
                        onChange={(event) => setPriority(event.target.value)}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      >
                        <option value="">None</option>
                        {priorities.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Component</label>
                      <input
                        value={componentName}
                        onChange={(event) => setComponentName(event.target.value)}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Fix version</label>
                      <input
                        value={versionName}
                        onChange={(event) => setVersionName(event.target.value)}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Original estimate (hours)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={originalEstimate}
                        onChange={(event) => setOriginalEstimate(event.target.value)}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Remaining estimate (hours)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={remainingEstimate}
                        onChange={(event) => setRemainingEstimate(event.target.value)}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-600">Labels</label>
                      <input
                        value={labels}
                        onChange={(event) => setLabels(event.target.value)}
                        className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                        placeholder="frontend, api, urgent"
                      />
                    </div>
                    {currentIssue.issue_type !== 'Epic' ? (
                      <div className="relative md:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-slate-600">Epic link</label>
                        <input
                          value={epicQuery}
                          onChange={(event) => handleEpicInputChange(event.target.value)}
                          className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                          placeholder="Search epics by key or summary"
                        />
                        {epicResults.length > 0 ? (
                          <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-sm border border-slate-200 bg-white shadow-lg">
                            {epicResults.map((epic) => (
                              <button
                                key={epic.issue_id}
                                type="button"
                                onClick={() => handleSelectEpic(epic)}
                                className="block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0"
                              >
                                <p className="text-sm font-semibold text-slate-900">{epic.issue_key}</p>
                                <p className="text-xs text-slate-500">{epic.summary}</p>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={handleUpdateEpic}
                            disabled={isSubmitting}
                            className="rounded-sm bg-jira-blue px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                          >
                            Save epic
                          </button>
                          <button
                            type="button"
                            onClick={handleClearEpicSelection}
                            disabled={isSubmitting}
                            className="rounded-sm border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            Remove epic
                          </button>
                        </div>
                        {isSearchingEpics ? <p className="mt-2 text-xs text-slate-500">Searching epics...</p> : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-x-10 gap-y-5 p-5 md:grid-cols-2">
                    {detailFields.map((field) => (
                      <div key={field.label}>
                        <p className="text-sm font-medium text-slate-500">{field.label}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-900">{field.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-lg font-semibold text-slate-950">Description</h3>
                </div>
                <div className="p-5">
                  {isEditing ? (
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={8}
                      className="w-full rounded-sm border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
                    />
                  ) : description ? (
                    <div className="space-y-4 text-sm leading-7 text-slate-700">
                      {description.split(/\n{2,}/).map((paragraph, index) => (
                        <p key={`${currentIssue.issue_id}-description-${index}`} className="whitespace-pre-wrap">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No description provided.</p>
                  )}
                </div>
              </section>

              <section className="rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button className={tabButtonClass('details')} onClick={() => setActiveTab('details')}>
                      Activity overview
                    </button>
                    <button className={tabButtonClass('comments')} onClick={() => setActiveTab('comments')}>
                      Comments ({comments.length})
                    </button>
                    <button className={tabButtonClass('worklogs')} onClick={() => setActiveTab('worklogs')}>
                      Work log ({worklogs.length})
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  {activeTab === 'details' ? (
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-sm bg-slate-50 px-4 py-4">
                        <p className="text-sm text-slate-500">Reporter</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{currentIssue.reporter_display_name}</p>
                        <p className="mt-1 text-xs text-slate-500">@{currentIssue.reporter_username}</p>
                      </div>
                      <div className="rounded-sm bg-slate-50 px-4 py-4">
                        <p className="text-sm text-slate-500">Created</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(currentIssue.created_at)}</p>
                      </div>
                      <div className="rounded-sm bg-slate-50 px-4 py-4">
                        <p className="text-sm text-slate-500">Updated</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(currentIssue.updated_at)}</p>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'comments' ? (
                    <div className="space-y-5">
                      {comments.length === 0 ? (
                        <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                          No comments yet.
                        </div>
                      ) : (
                        comments.map((commentItem) => (
                          <div key={commentItem.comment_id} className="rounded-sm border border-slate-200 px-4 py-4">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
                                {getInitials(commentItem.display_name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-900">{commentItem.display_name}</p>
                                  <p className="text-xs text-slate-500">{formatDateTime(commentItem.created_at)}</p>
                                </div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{commentItem.body}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}

                      <div className="rounded-sm border border-slate-200 bg-slate-50 p-4">
                        <textarea
                          value={comment}
                          onChange={(event) => setComment(event.target.value)}
                          onKeyDown={handleKeyPress}
                          placeholder="Add a comment..."
                          rows={4}
                          className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
                        />
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={handleAddComment}
                            disabled={isSubmitting || !comment.trim()}
                            className="inline-flex items-center rounded-sm bg-jira-blue px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                          >
                            <PlusIcon className="mr-2 h-4 w-4" />
                            Add comment
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'worklogs' ? (
                    <div className="space-y-5">
                      <div className="rounded-sm border border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-3 md:grid-cols-[140px_1fr]">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={timeSpent}
                            onChange={(event) => setTimeSpent(event.target.value)}
                            placeholder="Hours"
                            className="rounded-sm border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-sky-400"
                          />
                          <input
                            type="datetime-local"
                            value={startedAt}
                            onChange={(event) => setStartedAt(event.target.value)}
                            className="rounded-sm border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-sky-400"
                          />
                        </div>
                        <textarea
                          value={worklogComment}
                          onChange={(event) => setWorklogComment(event.target.value)}
                          rows={3}
                          placeholder="What did you work on?"
                          className="mt-3 w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
                        />
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={handleAddWorklog}
                            disabled={isSubmitting || !timeSpent}
                            className="rounded-sm bg-jira-blue px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                          >
                            Add work log
                          </button>
                        </div>
                      </div>

                      {worklogs.length === 0 ? (
                        <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                          No hours logged yet.
                        </div>
                      ) : (
                        worklogs.map((entry) => (
                          <div key={entry.worklog_id} className="rounded-sm border border-slate-200 px-4 py-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{entry.display_name || entry.username || 'Team member'}</p>
                                <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.started_at)}</p>
                              </div>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                                {entry.time_spent}h
                              </span>
                            </div>
                            {entry.comment ? <p className="mt-3 text-sm leading-7 text-slate-700">{entry.comment}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-lg font-semibold text-slate-950">People</h3>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Assignee</p>
                    {isEditing ? (
                      <div className="relative mt-2">
                        <input
                          value={assigneeQuery}
                          onChange={(event) => handleAssigneeInputChange(event.target.value)}
                          className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                          placeholder="Search by name, username, or email"
                        />
                        {assigneeResults.length > 0 ? (
                          <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-sm border border-slate-200 bg-white shadow-lg">
                            {assigneeResults.map((user) => (
                              <button
                                key={user.user_id}
                                type="button"
                                onClick={() => handleSelectAssignee(user)}
                                className="block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0"
                              >
                                <p className="text-sm font-semibold text-slate-900">{user.display_name}</p>
                                <p className="text-xs text-slate-500">@{user.username} - {user.email}</p>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {isSearchingAssignees ? <p className="mt-2 text-xs text-slate-500">Searching team members...</p> : null}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
                          {getInitials(currentIssue.assignee_name || currentIssue.assignee_username)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{currentIssue.assignee_name || currentIssue.assignee_username || 'Unassigned'}</p>
                          {currentIssue.assignee_username ? <p className="text-xs text-slate-500">@{currentIssue.assignee_username}</p> : null}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-500">Reporter</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">
                        {getInitials(currentIssue.reporter_display_name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{currentIssue.reporter_display_name}</p>
                        <p className="text-xs text-slate-500">@{currentIssue.reporter_username}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-lg font-semibold text-slate-950">Dates</h3>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Created</p>
                    <p className="mt-1 text-sm text-slate-900">{formatDateTime(currentIssue.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Updated</p>
                    <p className="mt-1 text-sm text-slate-900">{formatDateTime(currentIssue.updated_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Due date</p>
                    {isEditing ? (
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        className="mt-2 w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400"
                      />
                    ) : (
                      <p className="mt-1 text-sm text-slate-900">{formatDate(currentIssue.due_date)}</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-lg font-semibold text-slate-950">Time Tracking</h3>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Estimated</span>
                      <span className="font-semibold text-slate-900">{formatHours(currentIssue.original_estimate)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: currentIssue.original_estimate ? '100%' : '0%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Remaining</span>
                      <span className="font-semibold text-slate-900">{formatHours(currentIssue.remaining_estimate)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-slate-400" style={{ width: remainingWidth }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Logged</span>
                      <span className="font-semibold text-slate-900">{formatHours(currentIssue.time_spent)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: loggedWidth }} />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-lg font-semibold text-slate-950">Context</h3>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Issue key</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{currentIssue.issue_key}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Labels</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(currentIssue.label_names || []).length > 0 ? (
                        (currentIssue.label_names || []).map((label) => (
                          <span key={label} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">None</span>
                      )}
                    </div>
                  </div>
                  {currentIssue.issue_type !== 'Epic' && !isEditing ? (
                    <div>
                      <p className="text-sm font-medium text-slate-500">Parent epic</p>
                      <p className="mt-1 text-sm text-slate-900">
                        {currentIssue.epic_issue_key ? `${currentIssue.epic_issue_key} - ${currentIssue.epic_issue_summary}` : 'None'}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
