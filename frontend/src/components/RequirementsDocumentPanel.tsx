'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/24/outline';
import { agentAPI } from '@/lib/api';
import { Project } from '@/types';

const ACCEPTED = '.pdf,.docx,.txt,.md,.markdown,.json,.yaml,.yml,.csv';
const ISSUE_TYPES = ['Story', 'Task', 'Bug'];
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

interface PlannedStory {
  summary: string;
  description?: string;
  issue_type?: string;
  priority?: string;
  estimate_hours?: number | null;
  labels?: string[];
}

interface PlannedEpic {
  summary: string;
  description?: string;
  stories: PlannedStory[];
}

interface Plan {
  project_summary: string;
  epics: PlannedEpic[];
  story_count: number;
  source: 'model' | 'fallback';
  model: string | null;
  filename?: string;
  characters?: number;
}

/**
 * Turn a requirements document into an epic-and-stories breakdown.
 *
 * The plan is always reviewed before anything is written. A model reading a
 * specification will mis-scope some of it, so the reviewer edits, drops, and
 * retypes rows here; only then does the create step run.
 */
export function RequirementsDocumentPanel({ projects }: { projects: Project[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState('');
  const [projectKey, setProjectKey] = useState(projects[0]?.project_key ?? '');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<'idle' | 'planning' | 'applying'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ epic_count: number; story_count: number } | null>(null);

  const totalStories = useMemo(
    () => (plan ? plan.epics.reduce((sum, epic) => sum + epic.stories.length, 0) : 0),
    [plan],
  );

  const analyse = async () => {
    if (!file) {
      setError('Choose a document first.');
      return;
    }
    setBusy('planning');
    setError('');
    setResult(null);
    try {
      const response = await agentAPI.planFromDocument(file, instructions.trim() || undefined);
      setPlan(response.data as Plan);
    } catch (caught) {
      const detail = caught as { response?: { data?: { detail?: string } } };
      setError(detail.response?.data?.detail || 'Could not read this document.');
      setPlan(null);
    } finally {
      setBusy('idle');
    }
  };

  const apply = async () => {
    if (!plan || !projectKey) return;
    setBusy('applying');
    setError('');
    try {
      const response = await agentAPI.applyDocumentPlan({
        project_key: projectKey,
        epics: plan.epics.map((epic) => ({
          summary: epic.summary,
          description: epic.description,
          stories: epic.stories.map((story) => ({
            summary: story.summary,
            description: story.description,
            issue_type: story.issue_type,
            priority: story.priority,
            estimate_hours: story.estimate_hours ?? null,
            labels: story.labels ?? [],
          })),
        })),
      });
      setResult(response.data as { epic_count: number; story_count: number });
      setPlan(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (caught) {
      const detail = caught as { response?: { data?: { detail?: string } } };
      setError(detail.response?.data?.detail || 'Could not create the work items.');
    } finally {
      setBusy('idle');
    }
  };

  const editEpic = (index: number, patch: Partial<PlannedEpic>) => {
    setPlan((current) => {
      if (!current) return current;
      const epics = [...current.epics];
      epics[index] = { ...epics[index], ...patch };
      return { ...current, epics };
    });
  };

  const editStory = (epicIndex: number, storyIndex: number, patch: Partial<PlannedStory>) => {
    setPlan((current) => {
      if (!current) return current;
      const epics = [...current.epics];
      const stories = [...epics[epicIndex].stories];
      stories[storyIndex] = { ...stories[storyIndex], ...patch };
      epics[epicIndex] = { ...epics[epicIndex], stories };
      return { ...current, epics };
    });
  };

  const dropStory = (epicIndex: number, storyIndex: number) => {
    setPlan((current) => {
      if (!current) return current;
      const epics = [...current.epics];
      epics[epicIndex] = {
        ...epics[epicIndex],
        stories: epics[epicIndex].stories.filter((_, index) => index !== storyIndex),
      };
      return { ...current, epics };
    });
  };

  const dropEpic = (epicIndex: number) => {
    setPlan((current) =>
      current ? { ...current, epics: current.epics.filter((_, index) => index !== epicIndex) } : current,
    );
  };

  return (
    <section className="glass-panel rounded">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Requirements document</h3>
        <p className="mt-1 text-xs text-slate-600">
          Upload a specification and the agent proposes the epics and the stories under them. Nothing is created
          until you approve the breakdown.
        </p>
      </div>

      <div className="space-y-3 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <label className="block text-xs font-semibold text-slate-600">
            Document
            <div className="mt-1 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }}
                className="block w-full text-sm font-normal file:mr-3 file:rounded-sm file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              />
            </div>
            <span className="mt-1 block font-normal text-[0.7rem] text-slate-500">
              PDF, Word (.docx), Markdown, plain text, JSON, YAML, or CSV. Up to 10 MB.
            </span>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Create in project
            <select
              value={projectKey}
              onChange={(event) => setProjectKey(event.target.value)}
              className="mt-1 h-9 w-full rounded-sm px-2 text-sm font-normal"
            >
              {projects.map((project) => (
                <option key={project.project_id} value={project.project_key}>
                  {project.project_key} · {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-xs font-semibold text-slate-600">
          Extra instructions (optional)
          <input
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="e.g. only the authentication scope, split by service"
            className="mt-1 h-9 w-full rounded-sm px-2 text-sm font-normal"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void analyse()}
            disabled={busy !== 'idle' || !file}
            className="button-primary inline-flex h-8 items-center px-3 text-xs disabled:opacity-60"
          >
            <ArrowUpTrayIcon className="mr-1.5 h-4 w-4" />
            {busy === 'planning' ? 'Reading document…' : 'Analyse document'}
          </button>
          {plan ? (
            <button onClick={() => setPlan(null)} className="button-secondary h-8 px-3 text-xs">
              Discard plan
            </button>
          ) : null}
        </div>

        {busy === 'planning' ? (
          <p className="text-xs text-slate-500">
            Waiting on the language model. Reasoning models served through NIM can take a couple of minutes on a
            long document; if it does not answer, the plan falls back to the document&apos;s own headings.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        ) : null}

        {result ? (
          <p className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Created {result.epic_count} epic{result.epic_count === 1 ? '' : 's'} and {result.story_count} stor
            {result.story_count === 1 ? 'y' : 'ies'} in {projectKey}.
          </p>
        ) : null}

        {plan ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  Proposed plan · {plan.epics.length} epic{plan.epics.length === 1 ? '' : 's'}, {totalStories} stor
                  {totalStories === 1 ? 'y' : 'ies'}
                </p>
                {plan.project_summary ? (
                  <p className="mt-0.5 text-xs text-slate-600">{plan.project_summary}</p>
                ) : null}
              </div>
              <span className="ado-pill" title={plan.model ? `Model: ${plan.model}` : undefined}>
                {plan.source === 'model' ? `Drafted by ${plan.model ?? 'the model'}` : 'Structured from headings'}
              </span>
            </div>

            {plan.source === 'fallback' ? (
              <p className="rounded-sm bg-amber-50 px-3 py-2 text-[0.7rem] text-amber-900">
                No model was reachable, so this came from the document&apos;s own headings. Check the grouping
                before creating it.
              </p>
            ) : null}

            {plan.epics.map((epic, epicIndex) => (
              <div key={epicIndex} className="rounded-sm border border-slate-200">
                <div className="flex items-start gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="ado-pill mt-0.5 shrink-0">Epic</span>
                  <input
                    value={epic.summary}
                    onChange={(event) => editEpic(epicIndex, { summary: event.target.value })}
                    className="h-7 min-w-0 flex-1 rounded-sm px-2 text-sm font-semibold"
                  />
                  <button
                    onClick={() => dropEpic(epicIndex)}
                    className="shrink-0 rounded-sm p-1 text-slate-500 transition hover:text-rose-600"
                    aria-label={`Remove epic ${epic.summary}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                <ul className="divide-y divide-slate-100">
                  {epic.stories.map((story, storyIndex) => (
                    <li key={storyIndex} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <input
                        value={story.summary}
                        onChange={(event) => editStory(epicIndex, storyIndex, { summary: event.target.value })}
                        className="h-7 min-w-0 flex-1 rounded-sm px-2 text-[13px]"
                      />
                      <select
                        value={story.issue_type ?? 'Story'}
                        onChange={(event) => editStory(epicIndex, storyIndex, { issue_type: event.target.value })}
                        className="h-7 rounded-sm px-1.5 text-xs"
                      >
                        {ISSUE_TYPES.map((type) => <option key={type}>{type}</option>)}
                      </select>
                      <select
                        value={story.priority ?? 'Medium'}
                        onChange={(event) => editStory(epicIndex, storyIndex, { priority: event.target.value })}
                        className="h-7 rounded-sm px-1.5 text-xs"
                      >
                        {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={story.estimate_hours ?? ''}
                        onChange={(event) =>
                          editStory(epicIndex, storyIndex, {
                            estimate_hours: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                        placeholder="h"
                        className="h-7 w-14 rounded-sm px-1.5 text-xs"
                      />
                      <button
                        onClick={() => dropStory(epicIndex, storyIndex)}
                        className="rounded-sm p-1 text-slate-500 transition hover:text-rose-600"
                        aria-label={`Remove story ${story.summary}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                  {epic.stories.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-slate-500">No stories left under this epic.</li>
                  ) : null}
                </ul>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => void apply()}
                disabled={busy !== 'idle' || plan.epics.length === 0 || !projectKey}
                className="button-primary h-8 px-3 text-xs disabled:opacity-60"
              >
                {busy === 'applying'
                  ? 'Creating…'
                  : `Create ${plan.epics.length} epic${plan.epics.length === 1 ? '' : 's'} and ${totalStories} stor${totalStories === 1 ? 'y' : 'ies'}`}
              </button>
              <span className="text-xs text-slate-500">in {projectKey || 'no project selected'}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
