'use client';

import { useEffect, useState } from 'react';
import {
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { agentAPI, type AgentStreamEvent } from '@/lib/api';

type AgentStatus = {
  nim_available: boolean;
  selected_model: string | null;
  available_models: string[];
  mode: string;
  langchain_available?: boolean;
  ai_planner_available?: boolean;
  langgraph_available?: boolean;
  email_configured?: boolean;
};

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

type Finding = {
  severity: Severity | string;
  message: string;
  rule_id?: string;
  file_path?: string;
  line?: number;
  language?: string;
};

type RepositoryReview = {
  repository: {
    url: string;
    branch?: string;
    metadata?: Record<string, any>;
  };
  coverage?: Record<string, any>;
  scores?: Record<string, number>;
  score_explanation?: Record<string, any>;
  risk_summary?: {
    severity_counts?: Record<Severity, number>;
    total_findings?: number;
    high_or_critical_findings?: number;
    top_rule_ids?: Array<{ rule_id: string; count: number }>;
    riskiest_files?: Array<{ file_path: string; finding_count: number }>;
    dependency_coverage?: Record<string, any>;
  };
  languages?: Record<string, number>;
  project_structure?: Record<string, any>;
  dependency_vulnerabilities?: Record<string, any>;
  findings?: Finding[];
  gitignore_suggestions?: Array<{ path: string; message: string }>;
  file_reviews?: Array<Record<string, any>>;
  ai_summary?: {
    summary?: string;
    strengths?: string[];
    risks?: string[];
    recommended_next_steps?: string[];
    source_model?: string | null;
  };
  requested_by?: string;
};

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const severityStyles: Record<Severity, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-sky-200 bg-sky-50 text-sky-700',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function isRepositoryReview(value: any): value is RepositoryReview {
  return Boolean(value?.repository?.url && value?.scores && Array.isArray(value?.findings));
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  return 'Available';
}

function scoreTone(score?: number) {
  if (score === undefined || Number.isNaN(score)) return 'bg-slate-200 text-slate-700';
  if (score < 40) return 'bg-red-100 text-red-700';
  if (score < 70) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function scoreBar(score?: number) {
  if (score === undefined || Number.isNaN(score)) return 'bg-slate-300';
  if (score < 40) return 'bg-red-500';
  if (score < 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function severityClass(severity?: string) {
  const key = (severity || 'info').toLowerCase() as Severity;
  return severityStyles[key] || severityStyles.info;
}

export default function AgentsPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [question, setQuestion] = useState('What is the sprint status?');
  const [prompt, setPrompt] = useState(
    'Create project called Customer Support Portal with key CSP, create a scrum board, create a high priority story for implementing secure login, assign it to rupam, and send the issue mail notification.'
  );
  const [repositoryUrl, setRepositoryUrl] = useState('https://github.com/example/repository');
  const [repositoryBranch, setRepositoryBranch] = useState('');
  const [repositoryToken, setRepositoryToken] = useState('');
  const [maxFiles, setMaxFiles] = useState('120');
  const [result, setResult] = useState<any>(null);
  const [streamEvents, setStreamEvents] = useState<AgentStreamEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    const response = await agentAPI.getStatus();
    setStatus(response.data);
  }

  async function runAutomation() {
    setLoading(true);
    setResult(null);
    setStreamEvents([]);
    try {
      await agentAPI.runAutomationStream({ intent: 'full_scan' }, handleStreamEvent);
    } finally {
      setLoading(false);
    }
  }

  async function askAgent() {
    setLoading(true);
    setResult(null);
    setStreamEvents([]);
    try {
      await agentAPI.askStream(question, handleStreamEvent);
    } finally {
      setLoading(false);
    }
  }

  async function executePrompt() {
    setLoading(true);
    setResult(null);
    setStreamEvents([]);
    try {
      await agentAPI.executePromptStream(prompt, handleStreamEvent);
      await loadStatus();
    } finally {
      setLoading(false);
    }
  }

  async function reviewRepository() {
    setLoading(true);
    setResult(null);
    setStreamEvents([]);
    try {
      await agentAPI.reviewRepositoryStream({
        repository_url: repositoryUrl,
        branch: repositoryBranch.trim() || undefined,
        github_token: repositoryToken.trim() || undefined,
        max_files: maxFiles ? Number(maxFiles) : undefined,
      }, handleStreamEvent);
    } finally {
      setLoading(false);
    }
  }

  function handleStreamEvent(event: AgentStreamEvent) {
    setStreamEvents((current) => [...current, event]);
    if (event.type === 'result') {
      setResult(event.data);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">Agentic AI</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Automation command center</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Run the full backend workflow, inspect pending actions, or ask focused operational questions.
        </p>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <div className="rounded-sm bg-slate-100 px-4 py-2 text-slate-700">
            Mode: <span className="font-semibold">{status?.mode || 'Loading...'}</span>
          </div>
          <div className="rounded-sm bg-slate-100 px-4 py-2 text-slate-700">
            Model: <span className="font-semibold">{status?.selected_model || 'Fallback only'}</span>
          </div>
          <div className="rounded-sm bg-slate-100 px-4 py-2 text-slate-700">
            NIM: <span className="font-semibold">{status?.nim_available ? 'Configured' : 'Needs NIM env'}</span>
          </div>
          <div className="rounded-sm bg-slate-100 px-4 py-2 text-slate-700">
            LangChain: <span className="font-semibold">{status?.langchain_available ? 'ChatNVIDIA ready' : 'Needs package/env'}</span>
          </div>
          <div className="rounded-sm bg-slate-100 px-4 py-2 text-slate-700">
            LangGraph: <span className="font-semibold">{status?.langgraph_available ? 'Ready' : 'Fallback graph'}</span>
          </div>
          <div className="rounded-sm bg-slate-100 px-4 py-2 text-slate-700">
            Email: <span className="font-semibold">{status?.email_configured ? 'Configured' : 'Needs SMTP env'}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={runAutomation}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-sm bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <PlayIcon className="h-4 w-4" />
            Run full automation
          </button>
          <button
            onClick={() => {
              setResult(null);
              setStreamEvents([]);
            }}
            className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <XMarkIcon className="h-4 w-4" />
            Clear output
          </button>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
        <h3 className="text-lg font-semibold text-slate-950">Execute full prompt automation</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This path can create a project, create a board, create an issue, assign it to a named teammate or auto assign it, and attempt assignment email delivery.
        </p>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="mt-4 min-h-[150px] w-full rounded-sm border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
          placeholder="Describe the full workflow you want ZYRAA to automate..."
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={executePrompt}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-sm bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            <SparklesIcon className="h-4 w-4" />
            Run prompt automation
          </button>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
        <h3 className="text-lg font-semibold text-slate-950">Ask an agent</h3>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="flex-1 rounded-sm border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
            placeholder="Ask about sprint health, assignments, or PR review status..."
          />
          <button
            onClick={askAgent}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-sm bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
          >
            <ChatBubbleLeftRightIcon className="h-4 w-4" />
            Ask
          </button>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white/85 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
        <h3 className="text-lg font-semibold text-slate-950">Review a GitHub repository</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Paste a GitHub repository link and the agent will scan accessible source files for vulnerabilities, implementation risks, and heuristic syntax quality across mixed-language stacks.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <input
            value={repositoryUrl}
            onChange={(event) => setRepositoryUrl(event.target.value)}
            className="md:col-span-2 rounded-sm border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
            placeholder="https://github.com/owner/repository"
          />
          <input
            value={repositoryBranch}
            onChange={(event) => setRepositoryBranch(event.target.value)}
            className="rounded-sm border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
            placeholder="Branch (optional)"
          />
          <input
            value={maxFiles}
            onChange={(event) => setMaxFiles(event.target.value)}
            className="rounded-sm border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
            placeholder="Max files"
          />
          <input
            value={repositoryToken}
            onChange={(event) => setRepositoryToken(event.target.value)}
            className="md:col-span-2 rounded-sm border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400"
            placeholder="GitHub token for private repos (optional)"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={reviewRepository}
            disabled={loading || !repositoryUrl.trim()}
            className="inline-flex items-center gap-2 rounded-sm bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
          >
            <ShieldCheckIcon className="h-4 w-4" />
            Review repository
          </button>
        </div>
      </section>

      {(loading || streamEvents.length > 0) && <StreamProgress events={streamEvents} loading={loading} />}
      {result && <ResultRenderer result={result} />}
    </div>
  );
}

function StreamProgress({ events, loading }: { events: AgentStreamEvent[]; loading: boolean }) {
  const latest = [...events].reverse().find((event) => event.type === 'status' || event.type === 'error' || event.type === 'result');
  const statusEvents = events.filter((event) => event.type === 'status');
  const error = events.find((event) => event.type === 'error');

  return (
    <section className="rounded border border-slate-200 bg-white/90 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
            {error ? 'Stream error' : loading ? 'Streaming response' : 'Stream complete'}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">
            {latest?.message || 'Opening response stream...'}
          </h3>
          {latest?.elapsed_seconds !== undefined ? (
            <p className="mt-1 text-sm text-slate-500">{latest.elapsed_seconds}s elapsed</p>
          ) : null}
        </div>
        {loading ? (
          <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-sky-500 shadow-[0_0_0_8px_rgba(14,165,233,0.12)]" />
        ) : (
          <div className={cx('h-3 w-3 shrink-0 rounded-full', error ? 'bg-red-500' : 'bg-emerald-500')} />
        )}
      </div>

      <div className="mt-4 space-y-2">
        {statusEvents.slice(-6).map((event, index) => (
          <div key={`${event.message}-${event.elapsed_seconds}-${index}`} className="flex items-center gap-3 rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />
            <span className="min-w-0 flex-1">{event.message}</span>
            {event.elapsed_seconds !== undefined ? <span className="text-xs font-medium text-slate-500">{event.elapsed_seconds}s</span> : null}
          </div>
        ))}
        {error ? (
          <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.detail || error.message || 'The streamed request failed.'}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ResultRenderer({ result }: { result: any }) {
  if (isRepositoryReview(result)) {
    return <RepositoryReviewReport review={result} />;
  }
  if (result?.plan && result?.result) {
    return <PromptAutomationReport result={result} />;
  }
  if (result?.output || result?.pending_actions || result?.agent) {
    return <WorkflowReport result={result} />;
  }
  return <GenericReport result={result} title="Agent output" />;
}

function RepositoryReviewReport({ review }: { review: RepositoryReview }) {
  const scores = review.scores || {};
  const severityCounts: Partial<Record<Severity, number>> = review.risk_summary?.severity_counts || {};
  const findings = review.findings || [];
  const topFindings = findings.slice(0, 12);
  const topFiles = review.risk_summary?.riskiest_files || [];
  const topRules = review.risk_summary?.top_rule_ids || [];
  const dependencies = review.dependency_vulnerabilities || {};
  const structure = review.project_structure || {};

  return (
    <section className="rounded border border-slate-200 bg-white/90 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-600">Repository SAST report</p>
          <h3 className="mt-2 break-words text-xl font-semibold text-slate-950">
            {review.repository.metadata?.full_name || review.repository.url}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Branch <span className="font-semibold text-slate-800">{review.repository.branch || 'default'}</span>
            {review.requested_by ? <> · Requested by {review.requested_by}</> : null}
          </p>
        </div>
        <div className={cx('min-w-[116px] rounded-sm px-5 py-4 text-center', scoreTone(scores.overall_percent))}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Overall</p>
          <p className="mt-1 text-3xl font-bold">{formatValue(scores.overall_percent)}%</p>
        </div>
      </div>

      {review.ai_summary?.summary ? (
        <div className="mt-5 rounded-sm border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm leading-6 text-slate-700">{review.ai_summary.summary}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ScoreMetric label="Security" value={scores.security_percent} />
        <ScoreMetric label="Implementation" value={scores.implementation_quality_percent} />
        <ScoreMetric label="Maintainability" value={scores.maintainability_percent} />
        <ScoreMetric label="Syntax" value={scores.syntax_correctness_percent} />
        <MetricBlock label="Findings" value={review.risk_summary?.total_findings ?? findings.length} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {severityOrder.map((severity) => (
          <div key={severity} className={cx('rounded-sm border px-4 py-3', severityClass(severity))}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">{severity}</p>
            <p className="mt-1 text-2xl font-bold">{severityCounts[severity] || 0}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div>
          <SectionTitle title="Top Findings" meta={`${findings.length} total`} />
          <div className="mt-3 overflow-hidden rounded-sm border border-slate-200">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Rule</th>
                    <th className="px-4 py-3">Finding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {topFindings.map((finding, index) => (
                    <tr key={`${finding.rule_id}-${finding.file_path}-${finding.line}-${index}`}>
                      <td className="px-4 py-3 align-top">
                        <span className={cx('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize', severityClass(finding.severity))}>
                          {finding.severity || 'info'}
                        </span>
                      </td>
                      <td className="max-w-[260px] px-4 py-3 align-top text-xs text-slate-600">
                        <span className="break-words font-medium text-slate-800">{finding.file_path || 'repository'}</span>
                        {finding.line ? <span className="block text-slate-500">Line {finding.line}</span> : null}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-600">{finding.rule_id || 'unknown'}</td>
                      <td className="px-4 py-3 align-top text-slate-700">{finding.message}</td>
                    </tr>
                  ))}
                  {!topFindings.length ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={4}>
                        No findings returned.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <SummaryList
            title="Riskiest Files"
            items={topFiles.slice(0, 8).map((item) => ({
              label: item.file_path,
              value: `${item.finding_count} findings`,
            }))}
            empty="No risky files ranked."
          />
          <SummaryList
            title="Frequent Rules"
            items={topRules.slice(0, 8).map((item) => ({
              label: item.rule_id,
              value: String(item.count),
            }))}
            empty="No repeated rules."
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <KeyValuePanel
          title="Coverage"
          data={{
            'Analyzed files': review.coverage?.analyzed_files,
            'Repository paths': review.coverage?.repository_paths_seen,
            'Generated skipped': review.coverage?.generated_files_skipped_from_scores,
            'Coverage penalty': review.coverage?.coverage_penalty,
            'Tree truncated': review.coverage?.tree_truncated,
            'Fetch error': review.coverage?.fetch_error,
          }}
        />
        <KeyValuePanel
          title="Dependencies"
          data={{
            'Dependencies seen': dependencies.dependencies_seen,
            'Queried by OSV': dependencies.queried_dependencies,
            Vulnerabilities: dependencies.vulnerabilities?.length || 0,
            Ecosystems: Object.keys(dependencies.ecosystems || {}).join(', ') || 'None',
            'OSV error': dependencies.osv_error,
          }}
        />
        <KeyValuePanel
          title="Project Structure"
          data={{
            Entrypoints: (structure.entrypoint_candidates || []).slice(0, 3).join(', ') || 'None',
            Manifests: (structure.manifest_files || []).slice(0, 3).join(', ') || 'None',
            Languages: Object.entries(review.languages || {})
              .slice(0, 4)
              .map(([name, count]) => `${name} ${count}`)
              .join(', ') || 'None',
          }}
        />
      </div>

      <ListPanel title="Recommended Next Steps" items={review.ai_summary?.recommended_next_steps || []} />
      <ListPanel title="Risks" items={review.ai_summary?.risks || []} />

      <RawJson result={review} />
    </section>
  );
}

function PromptAutomationReport({ result }: { result: any }) {
  const created = result.result || {};
  const plan = result.plan || {};
  const issues = created.issues || [];
  const assignments = created.assignments || [];

  return (
    <section className="rounded border border-slate-200 bg-white/90 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
      <SectionHeader eyebrow="Prompt automation" title="Execution result" subtitle={`Mode ${result.mode || 'fallback'} · ${result.workflow_engine || 'workflow'}`} />
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MetricBlock label="Project" value={created.project?.project_key || 'None'} detail={created.project?.name} />
        <MetricBlock label="Board" value={created.board?.name || 'None'} detail={created.board?.board_type} />
        <MetricBlock label="Issues" value={issues.length || (created.issue ? 1 : 0)} detail={created.assignment?.assigned ? 'Assigned' : 'No primary assignment'} />
      </div>

      {issues.length ? (
        <div className="mt-6">
          <SectionTitle title="Created Issues" />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {issues.map((issue: any) => (
              <div key={issue.issue_id || issue.issue_key} className="rounded-sm border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{issue.issue_key || 'Issue'}</p>
                <p className="mt-1 text-sm text-slate-600">{issue.summary}</p>
                <p className="mt-2 text-xs font-medium text-slate-500">{issue.issue_type || 'Work item'}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {assignments.length ? (
        <SummaryList
          title="Assignments"
          items={assignments.map((assignment: any, index: number) => ({
            label: assignment.assignee_display_name || assignment.assignee_username || `Assignment ${index + 1}`,
            value: assignment.assigned ? assignment.assignment_method || 'assigned' : assignment.reason || 'not assigned',
          }))}
          empty="No assignments returned."
        />
      ) : null}

      <KeyValuePanel
        title="Interpreted Plan"
        data={{
          Project: plan.project?.name,
          Board: plan.board?.name,
          'Issue count': plan.issues?.length || 0,
          Email: plan.email?.send_assignment_email,
        }}
      />
      <RawJson result={result} />
    </section>
  );
}

function WorkflowReport({ result }: { result: any }) {
  const output = result.output || {};
  const pendingActions = result.pending_actions || [];

  return (
    <section className="rounded border border-slate-200 bg-white/90 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
      <SectionHeader eyebrow={result.agent || 'Workflow'} title="Agent result" subtitle={result.error ? `Error: ${result.error}` : 'Completed'} />

      {output.executive ? (
        <div className="mt-5 rounded-sm border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Executive Summary</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{output.executive.summary || 'No summary returned.'}</p>
          <ListPanel title="Recommended Actions" items={output.executive.recommended_actions || []} compact />
        </div>
      ) : result.summary ? (
        <div className="mt-5 rounded-sm border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm leading-6 text-slate-700">{result.summary}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MetricBlock label="Pending actions" value={pendingActions.length} />
        <MetricBlock label="Sprint updates" value={(output.sprint?.activated?.length || 0) + (output.sprint?.closed?.length || 0) + (output.sprint?.created?.length || 0)} />
        <MetricBlock label="PR reviews" value={output.pr_health?.length || 0} />
      </div>

      {output.assignment ? (
        <div className="mt-6">
          <SectionTitle title="Assignment Recommendation" />
          <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">
              {output.assignment.issue_key}: {output.assignment.best_assignee_display_name || output.assignment.best_assignee_username || 'No assignee'}
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(output.assignment.candidate_scores || []).map((candidate: any) => (
                <div key={candidate.user_id} className="rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-slate-900">{candidate.display_name || candidate.username}</span>
                  <span className="float-right text-slate-600">{candidate.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {pendingActions.length ? (
        <SummaryList
          title="Pending Actions"
          items={pendingActions.map((action: any) => ({
            label: action.title || action.action_type,
            value: action.status,
          }))}
          empty="No pending actions."
        />
      ) : null}

      <RawJson result={result} />
    </section>
  );
}

function GenericReport({ result, title }: { result: any; title: string }) {
  const entries = Object.entries(result || {}).filter(([, value]) => typeof value !== 'object' || value === null).slice(0, 12);
  return (
    <section className="rounded border border-slate-200 bg-white/90 p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur">
      <SectionHeader eyebrow="Agent output" title={title} />
      {entries.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {entries.map(([key, value]) => (
            <MetricBlock key={key} label={key.replaceAll('_', ' ')} value={formatValue(value)} />
          ))}
        </div>
      ) : null}
      <RawJson result={result} />
    </section>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-950">{title}</h3>
      {subtitle ? <p className="mt-2 text-sm text-slate-600">{subtitle}</p> : null}
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      {meta ? <span className="text-xs font-medium text-slate-500">{meta}</span> : null}
    </div>
  );
}

function ScoreMetric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-sm border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <span className={cx('rounded-full px-2 py-1 text-xs font-semibold', scoreTone(value))}>{formatValue(value)}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={cx('h-full rounded-full', scoreBar(value))} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
      </div>
    </div>
  );
}

function MetricBlock({ label, value, detail }: { label: string; value: any; detail?: string }) {
  return (
    <div className="rounded-sm border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-slate-950">{formatValue(value)}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function KeyValuePanel({ title, data }: { title: string; data: Record<string, any> }) {
  return (
    <div className="rounded-sm border border-slate-200 bg-slate-50 p-4">
      <SectionTitle title={title} />
      <dl className="mt-3 space-y-2">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-3 text-sm">
            <dt className="min-w-[120px] text-slate-500">{key}</dt>
            <dd className="min-w-0 flex-1 break-words font-medium text-slate-800">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SummaryList({ title, items, empty }: { title: string; items: Array<{ label: string; value?: string }>; empty: string }) {
  return (
    <div className="rounded-sm border border-slate-200 bg-slate-50 p-4">
      <SectionTitle title={title} />
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <div key={`${item.label}-${item.value}`} className="flex items-start justify-between gap-3 rounded-sm bg-white px-3 py-2 text-sm">
            <span className="min-w-0 break-words font-medium text-slate-800">{item.label}</span>
            {item.value ? <span className="shrink-0 text-xs font-semibold text-slate-500">{item.value}</span> : null}
          </div>
        )) : <p className="text-sm text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}

function ListPanel({ title, items, compact = false }: { title: string; items: string[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <div className={cx(compact ? 'mt-4' : 'mt-6 rounded-sm border border-slate-200 bg-slate-50 p-4')}>
      <SectionTitle title={title} />
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="rounded-sm bg-white px-3 py-2 leading-6">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RawJson({ result }: { result: any }) {
  return (
    <details className="mt-6 rounded-sm border border-slate-200 bg-slate-950 text-slate-100">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
        Raw JSON
        <ChevronDownIcon className="h-4 w-4" />
      </summary>
      <pre className="max-h-[520px] overflow-auto border-t border-white/10 p-4 text-xs leading-6">
        {JSON.stringify(result, null, 2)}
      </pre>
    </details>
  );
}
