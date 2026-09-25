'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Attachment, Comment, Issue, User, Worklog } from '@/types';
import { attachmentAPI, issueAPI, userAPI } from '@/lib/api';
import { IssueComposerModal } from '@/components/IssueComposerModal';
import { TimeTrackingPanel } from '@/components/TimeTrackingPanel';
import {
  InlineDate,
  InlineHeading,
  InlineNumber,
  InlineSelect,
  InlineTags,
  InlineText,
  InlineTextarea,
  ReadOnlyField,
} from '@/components/InlineEdit';

type IssueDetailPageProps = {
  initialIssue: Issue;
  onIssueUpdated?: (issue: Issue) => void | Promise<void>;
};

type DraftState = {
  projectKey: string;
  issueType: Issue['issue_type'];
  status: Issue['status'];
  priority: string;
  summary: string;
  description: string;
  componentName: string;
  versionName: string;
  originalEstimate: string;
  remainingEstimate: string;
  dueDate: string;
  labels: string;
};

const statuses = ['To Do', 'In Progress', 'In Review', 'Done', 'Cancelled'];
const priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const issueTypes = ['Epic', 'Story', 'Task', 'Bug', 'Subtask'];

const formatAssigneeLabel = (user: User) => `${user.display_name} (@${user.username})`;

const buildDraft = (issue: Issue): DraftState => ({
  projectKey: issue.project_key || '',
  issueType: issue.issue_type,
  status: issue.status,
  priority: issue.priority || '',
  summary: issue.summary,
  description: issue.description || '',
  componentName: issue.component_name || '',
  versionName: issue.version_name || '',
  originalEstimate: issue.original_estimate?.toString() || '',
  remainingEstimate: issue.remaining_estimate?.toString() || '',
  dueDate: issue.due_date ? issue.due_date.slice(0, 10) : '',
  labels: (issue.label_names || []).join(', '),
});

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : 'None');
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : 'None');

const buildUpdatePayload = (draft: DraftState) => ({
  project_key: draft.projectKey.trim(),
  issue_type: draft.issueType,
  summary: draft.summary,
  description: draft.description,
  priority: draft.priority || null,
  status: draft.status,
  component_name: draft.componentName.trim() || null,
  version_name: draft.versionName.trim() || null,
  original_estimate: draft.originalEstimate ? Number(draft.originalEstimate) : undefined,
  remaining_estimate: draft.remainingEstimate ? Number(draft.remainingEstimate) : undefined,
  due_date: draft.dueDate || null,
  label_names: draft.labels.split(',').map((label) => label.trim()).filter(Boolean),
});

export function IssueDetailPage({ initialIssue, onIssueUpdated }: IssueDetailPageProps) {
  const router = useRouter();
  const [issue, setIssue] = useState(initialIssue);
  const [draft, setDraft] = useState<DraftState>(() => buildDraft(initialIssue));
  const [comments, setComments] = useState<Comment[]>([]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'worklogs' | 'attachments'>('details');
  const [assigneeQuery, setAssigneeQuery] = useState(initialIssue.assignee_username || '');
  const [selectedAssignee, setSelectedAssignee] = useState<User | null>(null);
  const [assigneeResults, setAssigneeResults] = useState<User[]>([]);
  const [isSearchingAssignees, setIsSearchingAssignees] = useState(false);
  const [isEditingAssignee, setIsEditingAssignee] = useState(false);
  const [epicQuery, setEpicQuery] = useState(initialIssue.epic_issue_key ? `${initialIssue.epic_issue_key} - ${initialIssue.epic_issue_summary || ''}`.trim() : '');
  const [selectedEpicKey, setSelectedEpicKey] = useState<string | null>(initialIssue.epic_issue_key || null);
  const [epicResults, setEpicResults] = useState<Issue[]>([]);
  const [isSearchingEpics, setIsSearchingEpics] = useState(false);
  const [comment, setComment] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const lastSavedPayloadRef = useRef(JSON.stringify(buildUpdatePayload(buildDraft(initialIssue))));
  const syncingRef = useRef(false);

  useEffect(() => {
    setIssue(initialIssue);
    setDraft(buildDraft(initialIssue));
    setAssigneeQuery(initialIssue.assignee_username || '');
    setSelectedAssignee(null);
    setEpicQuery(initialIssue.epic_issue_key ? `${initialIssue.epic_issue_key} - ${initialIssue.epic_issue_summary || ''}`.trim() : '');
    setSelectedEpicKey(initialIssue.epic_issue_key || null);
    lastSavedPayloadRef.current = JSON.stringify(buildUpdatePayload(buildDraft(initialIssue)));
  }, [initialIssue]);

  useEffect(() => {
    void fetchComments();
    void fetchWorklogs();
    void fetchAttachments();
  }, [issue.issue_id]);

  useEffect(() => {
    const search = assigneeQuery.trim();
    if (search.length < 2) {
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
  }, [assigneeQuery, selectedAssignee]);

  useEffect(() => {
    const search = epicQuery.trim();
    if (issue.issue_type === 'Epic' || !issue.project_key || search.length < 2) {
      setEpicResults([]);
      setIsSearchingEpics(false);
      return;
    }
    if (selectedEpicKey && search.startsWith(selectedEpicKey)) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingEpics(true);
      try {
        const response = await issueAPI.getAll({
          project_key: issue.project_key,
          issue_type_name: 'Epic',
          search,
          limit: 8,
        });
        setEpicResults((response.data as Issue[]).filter((candidate) => candidate.issue_id !== issue.issue_id));
      } catch (searchError) {
        console.error('Failed to search epics:', searchError);
        setEpicResults([]);
      } finally {
        setIsSearchingEpics(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [epicQuery, issue.issue_id, issue.issue_type, issue.project_key, selectedEpicKey]);

  /**
   * Save one field. Each editor calls this with just what it changed, so a
   * failure names the field that failed and nothing else is overwritten.
   */
  const saveField = async (patch: Record<string, unknown>) => {
    syncingRef.current = true;
    setError('');
    try {
      const response = await issueAPI.update(issue.issue_id, patch);
      const updatedIssue = response.data as Issue;
      setIssue(updatedIssue);
      setDraft(buildDraft(updatedIssue));
      setAssigneeQuery(updatedIssue.assignee_username || '');
      setEpicQuery(updatedIssue.epic_issue_key ? `${updatedIssue.epic_issue_key} - ${updatedIssue.epic_issue_summary || ''}`.trim() : '');
      setSelectedEpicKey(updatedIssue.epic_issue_key || null);
      await onIssueUpdated?.(updatedIssue);
    } finally {
      syncingRef.current = false;
    }
  };

  /** Pull the issue and its work log back after time tracking changes. */
  const refreshIssue = async () => {
    const [refreshed] = await Promise.all([issueAPI.getById(issue.issue_id), fetchWorklogs()]);
    const updatedIssue = refreshed.data as Issue;
    setIssue(updatedIssue);
    setDraft(buildDraft(updatedIssue));
    await onIssueUpdated?.(updatedIssue);
  };

  const fetchComments = async () => {
    try {
      const res = await issueAPI.getComments(issue.issue_id);
      setComments(res.data);
    } catch (fetchError) {
      console.error('Failed to fetch comments:', fetchError);
    }
  };

  const fetchWorklogs = async () => {
    try {
      const res = await issueAPI.getWorklogs(issue.issue_id);
      setWorklogs(res.data);
    } catch (fetchError) {
      console.error('Failed to fetch worklogs:', fetchError);
    }
  };

  const fetchAttachments = async () => {
    try {
      const res = await attachmentAPI.getByIssue(issue.issue_id);
      setAttachments(res.data as Attachment[]);
    } catch (fetchError) {
      console.error('Failed to fetch attachments:', fetchError);
    }
  };

  const handleUploadAttachment = async (file?: File) => {
    if (!file) return;
    setIsSubmitting(true);
    try {
      await attachmentAPI.upload(issue.issue_id, file);
      await fetchAttachments();
      setActiveTab('attachments');
    } catch (uploadError) {
      console.error('Failed to upload attachment:', uploadError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    setIsSubmitting(true);
    try {
      await attachmentAPI.delete(attachmentId);
      await fetchAttachments();
    } catch (deleteError) {
      console.error('Failed to delete attachment:', deleteError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAttachment = async (attachment: Attachment) => {
    try {
      const response = await attachmentAPI.download(attachment.attachment_id);
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error('Failed to download attachment:', downloadError);
    }
  };

  const saveAssignee = async (username: string | null) => {
    setSaveState('saving');
    setError('');
    try {
      const response = await issueAPI.update(issue.issue_id, { assignee_username: username });
      const updatedIssue = response.data as Issue;
      setIssue(updatedIssue);
      setDraft(buildDraft(updatedIssue));
      setAssigneeQuery(updatedIssue.assignee_username || '');
      setSelectedAssignee(null);
      lastSavedPayloadRef.current = JSON.stringify(buildUpdatePayload(buildDraft(updatedIssue)));
      setSaveState('saved');
      await onIssueUpdated?.(updatedIssue);
    } catch (updateError: any) {
      console.error('Failed to update assignee:', updateError);
      setSaveState('error');
      setError(updateError?.response?.data?.detail || 'Failed to update assignee');
    }
  };

  const saveEpic = async (epicIssueKey: string | null, displayValue: string) => {
    setSaveState('saving');
    setError('');
    try {
      const response = await issueAPI.updateEpic(issue.issue_id, epicIssueKey);
      const updatedIssue = response.data as Issue;
      setIssue(updatedIssue);
      setDraft(buildDraft(updatedIssue));
      setEpicQuery(displayValue);
      setSelectedEpicKey(epicIssueKey);
      setEpicResults([]);
      lastSavedPayloadRef.current = JSON.stringify(buildUpdatePayload(buildDraft(updatedIssue)));
      setSaveState('saved');
      await onIssueUpdated?.(updatedIssue);
    } catch (updateError: any) {
      console.error('Failed to update epic:', updateError);
      setSaveState('error');
      setError(updateError?.response?.data?.detail || 'Failed to update epic');
    }
  };

  const handleSelectAssignee = async (user: User) => {
    setSelectedAssignee(user);
    setAssigneeQuery(formatAssigneeLabel(user));
    setAssigneeResults([]);
    await saveAssignee(user.username);
  };

  const handleClearAssignee = async () => {
    setAssigneeQuery('');
    setSelectedAssignee(null);
    setAssigneeResults([]);
    await saveAssignee(null);
  };

  const handleSelectEpic = async (epic: Issue) => {
    const displayValue = `${epic.issue_key} - ${epic.summary}`;
    setEpicQuery(displayValue);
    await saveEpic(epic.issue_key, displayValue);
  };

  const handleClearEpic = async () => {
    setEpicQuery('');
    setSelectedEpicKey(null);
    setEpicResults([]);
    await saveEpic(null, '');
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setIsSubmitting(true);
    try {
      await issueAPI.addComment(issue.issue_id, comment);
      setComment('');
      await fetchComments();
      setActiveTab('comments');
    } catch (commentError) {
      console.error('Failed to add comment:', commentError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              <ArrowLeftIcon className="mr-1 h-4 w-4" />
              Back
            </button>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {issue.project_id ? (
                <Link href={`/projects/${issue.project_id}`} className="font-semibold text-sky-700 hover:text-sky-800">
                  {issue.project_key}
                </Link>
              ) : (
                <span className="font-semibold text-sky-700">{issue.project_key}</span>
              )}
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">{issue.issue_key}</span>
            </div>
            <div className="mt-3 max-w-4xl">
              <InlineHeading value={issue.summary} onSave={(summary) => saveField({ summary })} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="ado-pill">{issue.issue_key}</span>
              <span className="ado-pill">{issue.issue_type}</span>
              <span className="ado-pill">{issue.status}</span>
            </div>
          </div>

          {issue.issue_type === 'Epic' ? (
            <button
              onClick={() => setIsComposerOpen(true)}
              className="button-primary inline-flex h-8 items-center px-3 text-[13px]"
            >
              <PlusIcon className="mr-2 h-5 w-5" />
              Add story
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-sm border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_320px]">
        <div className="space-y-6">
          <section className="glass-panel rounded">
            <div className="border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Details</h3>
            </div>
            <div className="grid gap-x-6 gap-y-4 p-5 md:grid-cols-2">
              <InlineText label="Project" value={draft.projectKey} onSave={(project_key) => saveField({ project_key: project_key.toUpperCase() })} />
              <InlineSelect label="Issue type" value={issue.issue_type} options={issueTypes} onSave={(issue_type) => saveField({ issue_type })} />
              <InlineSelect label="Status" value={issue.status} options={statuses} onSave={(status) => saveField({ status })} />
              <InlineSelect label="Priority" value={issue.priority || ''} options={priorities} allowEmpty placeholder="None" onSave={(priority) => saveField({ priority: priority || null })} />
              <InlineText label="Component" value={draft.componentName} onSave={(component_name) => saveField({ component_name: component_name || null })} />
              <InlineText label="Fix version" value={draft.versionName} onSave={(version_name) => saveField({ version_name: version_name || null })} />
              <InlineNumber
                label="Original estimate"
                value={issue.original_estimate ?? null}
                suffix="h"
                onSave={(original_estimate) => saveField({ original_estimate })}
                hint="The baseline this issue was planned against."
              />
              <InlineNumber
                label="Remaining estimate"
                value={issue.remaining_estimate ?? null}
                suffix="h"
                onSave={(remaining_estimate) => saveField({ remaining_estimate })}
                hint="Logging work moves this automatically."
              />
              <InlineDate label="Due date" value={draft.dueDate} onSave={(due_date) => saveField({ due_date })} />
              <ReadOnlyField label="Resolution" hint="Set by closing the issue.">
                {issue.resolution || 'Unresolved'}
              </ReadOnlyField>
              <div className="md:col-span-2">
                <InlineTags label="Labels" values={issue.label_names || []} onSave={(label_names) => saveField({ label_names })} />
              </div>
            </div>
          </section>

          <section className="glass-panel rounded">
            <div className="border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Description</h3>
            </div>
            <div className="p-5">
              <InlineTextarea
                label=""
                value={issue.description || ''}
                rows={10}
                placeholder="Add the problem statement, scope, expected behaviour, and any acceptance notes."
                onSave={(description) => saveField({ description })}
              />
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5">
              <div className="flex flex-wrap items-center gap-2">
                <button className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === 'details' ? 'border-jira-blue text-jira-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`} onClick={() => setActiveTab('details')}>Activity overview</button>
                <button className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === 'comments' ? 'border-jira-blue text-jira-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`} onClick={() => setActiveTab('comments')}>Comments ({comments.length})</button>
                <button className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === 'worklogs' ? 'border-jira-blue text-jira-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`} onClick={() => setActiveTab('worklogs')}>Work log ({worklogs.length})</button>
                <button className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === 'attachments' ? 'border-jira-blue text-jira-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`} onClick={() => setActiveTab('attachments')}>Attachments ({attachments.length})</button>
              </div>
            </div>
            <div className="p-5">
              {activeTab === 'details' ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-sm bg-slate-50 px-4 py-4"><p className="text-sm text-slate-500">Reporter</p><p className="mt-2 text-sm font-semibold text-slate-900">{issue.reporter_display_name}</p><p className="mt-1 text-xs text-slate-500">@{issue.reporter_username}</p></div>
                  <div className="rounded-sm bg-slate-50 px-4 py-4"><p className="text-sm text-slate-500">Created</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(issue.created_at)}</p></div>
                  <div className="rounded-sm bg-slate-50 px-4 py-4"><p className="text-sm text-slate-500">Updated</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(issue.updated_at)}</p></div>
                </div>
              ) : null}

              {activeTab === 'comments' ? (
                <div className="space-y-5">
                  {comments.map((item) => (
                    <div key={item.comment_id} className="rounded-sm border border-slate-200 px-4 py-4">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{item.display_name}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.body}</p>
                    </div>
                  ))}
                  <div className="rounded-sm border border-slate-200 bg-slate-50 p-4">
                    <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} className="w-full rounded-sm border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400" placeholder="Add a comment..." />
                    <div className="mt-3 flex justify-end">
                      <button onClick={handleAddComment} disabled={isSubmitting || !comment.trim()} className="inline-flex items-center rounded-sm bg-jira-blue px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Add comment
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === 'worklogs' ? (
                <div className="space-y-4">
                  {/* Logging happens in the Time tracking panel, which also shows
                      what each entry does to the remaining estimate. */}
                  <p className="text-xs text-slate-500">
                    {worklogs.length === 0
                      ? 'No work logged yet. Use “Log work” in the Time tracking panel.'
                      : `${worklogs.length} ${worklogs.length === 1 ? 'entry' : 'entries'}, ${issue.time_spent}h logged in total.`}
                  </p>
                  {worklogs.map((entry) => (
                    <div key={entry.worklog_id} className="rounded-sm border border-slate-200 px-4 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{entry.display_name || entry.username || 'Team member'}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.started_at)}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{entry.time_spent}h</span>
                      </div>
                      {entry.comment ? <p className="mt-3 text-sm leading-7 text-slate-700">{entry.comment}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {activeTab === 'attachments' ? (
                <div className="space-y-5">
                  <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 p-4">
                    <label className="block text-sm font-semibold text-slate-900">Upload file</label>
                    <input
                      type="file"
                      disabled={isSubmitting}
                      onChange={(event) => void handleUploadAttachment(event.target.files?.[0])}
                      className="mt-3 block w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    />
                    <p className="mt-2 text-xs text-slate-500">Files are stored by the backend and linked to this issue.</p>
                  </div>

                  {attachments.length === 0 ? (
                    <div className="rounded-sm border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                      No attachments yet.
                    </div>
                  ) : (
                    attachments.map((attachment) => (
                      <div key={attachment.attachment_id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-slate-200 px-4 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{attachment.filename}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {(attachment.file_size / 1024).toFixed(1)} KB | {attachment.mime_type} | {formatDateTime(attachment.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDownloadAttachment(attachment)}
                            className="rounded-sm border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAttachment(attachment.attachment_id)}
                            className="rounded-sm bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </div>
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
            <div className="border-b border-slate-200 px-5 py-4"><h3 className="text-lg font-semibold text-slate-950">People</h3></div>
            <div className="space-y-4 p-5">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Assignee</p>
                {isEditingAssignee ? (
                  <div className="relative">
                    <input
                      autoFocus
                      value={assigneeQuery}
                      onChange={(event) => setAssigneeQuery(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Escape') setIsEditingAssignee(false); }}
                      className="w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
                      placeholder="Search by name, username, or email"
                    />
                    {assigneeResults.length > 0 ? (
                      <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-sm border border-slate-200 bg-white shadow-md">
                        {assigneeResults.map((user) => (
                          <button
                            key={user.user_id}
                            type="button"
                            onClick={async () => { await handleSelectAssignee(user); setIsEditingAssignee(false); }}
                            className="block w-full border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-slate-50"
                          >
                            <p className="text-sm font-medium text-slate-900">{user.display_name}</p>
                            <p className="text-xs text-slate-500">@{user.username} · {user.email}</p>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {isSearchingAssignees ? <span className="text-xs text-slate-500">Searching…</span> : null}
                      <button type="button" onClick={() => setIsEditingAssignee(false)} className="button-secondary h-7 px-2.5 text-xs">
                        Cancel
                      </button>
                      {(issue.assignee_name || issue.assignee_username) ? (
                        <button
                          type="button"
                          onClick={async () => { await handleClearAssignee(); setIsEditingAssignee(false); }}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700"
                        >
                          Unassign
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingAssignee(true)}
                    aria-label="Edit assignee"
                    className={`w-full rounded-sm border border-transparent px-2 py-1.5 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50 ${
                      issue.assignee_username ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {issue.assignee_username ? (
                      <>
                        <span className="block font-medium">{issue.assignee_display_name || issue.assignee_name || issue.assignee_username}</span>
                        <span className="block text-xs text-slate-500">@{issue.assignee_username}</span>
                      </>
                    ) : (
                      'Unassigned'
                    )}
                  </button>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Reporter</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{issue.reporter_display_name}</p>
                <p className="text-xs text-slate-500">@{issue.reporter_username}</p>
              </div>
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4"><h3 className="text-lg font-semibold text-slate-950">Epic Link</h3></div>
            <div className="space-y-3 p-5">
              {issue.issue_type === 'Epic' ? (
                <p className="text-sm text-slate-600">This issue is an epic.</p>
              ) : (
                <>
                  <div className="relative">
                    <input value={epicQuery} onChange={(event) => setEpicQuery(event.target.value)} className="w-full rounded-sm border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-400" placeholder="Search epics by key or summary" />
                    {epicResults.length > 0 ? (
                      <div className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-sm border border-slate-200 bg-white shadow-lg">
                        {epicResults.map((epic) => (
                          <button key={epic.issue_id} type="button" onClick={() => void handleSelectEpic(epic)} className="block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0">
                            <p className="text-sm font-semibold text-slate-900">{epic.issue_key}</p>
                            <p className="text-xs text-slate-500">{epic.summary}</p>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {selectedEpicKey ? (
                      <button type="button" onClick={() => void handleClearEpic()} className="text-xs font-medium text-rose-600 hover:text-rose-700">
                        Remove epic link
                      </button>
                    ) : null}
                    {isSearchingEpics ? <p className="text-xs text-slate-500">Searching epics...</p> : null}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4"><h3 className="text-lg font-semibold text-slate-950">Dates</h3></div>
            <div className="space-y-4 p-5">
              <div><p className="text-sm font-medium text-slate-500">Created</p><p className="mt-1 text-sm text-slate-900">{formatDateTime(issue.created_at)}</p></div>
              <div><p className="text-sm font-medium text-slate-500">Updated</p><p className="mt-1 text-sm text-slate-900">{formatDateTime(issue.updated_at)}</p></div>
              <div><p className="text-sm font-medium text-slate-500">Due date</p><p className="mt-1 text-sm text-slate-900">{formatDate(issue.due_date)}</p></div>
            </div>
          </section>

          <TimeTrackingPanel issue={issue} worklogs={worklogs} onChanged={refreshIssue} />
        </aside>
      </div>

      {isComposerOpen ? (
        <IssueComposerModal
          projectKey={issue.project_key || ''}
          defaultIssueType="Story"
          parentEpic={{ issue_key: issue.issue_key, summary: issue.summary }}
          onClose={() => setIsComposerOpen(false)}
          onCreated={() => {
            setIsComposerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
