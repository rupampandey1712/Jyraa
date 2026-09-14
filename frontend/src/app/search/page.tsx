'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { filterAPI, issueAPI } from '@/lib/api';
import { Issue, SavedFilter } from '@/types';
import { useAuth } from '@/lib/auth-context';

const examples = [
  'project = DEMO status != Done',
  'assignee ~ rupam priority = High',
  'text ~ "login" labels = frontend',
];

export default function SearchPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [jql, setJql] = useState('status != Done');
  const [filterName, setFilterName] = useState('');
  const [results, setResults] = useState<Issue[]>([]);
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    void loadFilters();
    void runSearch('status != Done');
  }, [token, router]);

  const loadFilters = async () => {
    const response = await filterAPI.getAll();
    setFilters(response.data as SavedFilter[]);
  };

  const runSearch = async (query = jql) => {
    setIsLoading(true);
    try {
      const response = await issueAPI.advancedSearch({ jql: query, page: 1, page_size: 50 });
      setResults(response.data.items as Issue[]);
      setTotal(response.data.total);
    } finally {
      setIsLoading(false);
    }
  };

  const saveFilter = async () => {
    if (!filterName.trim() || !jql.trim()) return;
    await filterAPI.create({ name: filterName.trim(), jql_query: jql.trim(), is_favorite: true });
    setFilterName('');
    await loadFilters();
  };

  return (
    <div className="space-y-6">
      <section className="hero-panel rounded p-6">
        <p className="eyebrow text-sky-600">Advanced search</p>
        <h2 className="app-title mt-2 text-3xl font-semibold text-slate-950">JQL-like issue search</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Search by project, status, priority, assignee, reporter, label, key, summary, description, or text.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="glass-panel rounded p-6">
          <label className="text-sm font-semibold text-slate-700">Query</label>
          <textarea
            value={jql}
            onChange={(event) => setJql(event.target.value)}
            rows={3}
            className="mt-3 w-full rounded-sm border border-slate-300 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-sky-400"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => void runSearch()} className="button-primary rounded-sm px-4 py-2.5 text-sm font-semibold text-white">
              {isLoading ? 'Searching...' : 'Run search'}
            </button>
            <input
              value={filterName}
              onChange={(event) => setFilterName(event.target.value)}
              placeholder="Saved search name"
              className="min-w-64 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400"
            />
            <button onClick={() => void saveFilter()} className="button-secondary rounded-sm px-4 py-2.5 text-sm font-semibold">
              Save filter
            </button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button key={example} onClick={() => setJql(example)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {example}
              </button>
            ))}
          </div>
        </div>

        <aside className="glass-panel rounded p-6">
          <p className="eyebrow text-emerald-600">Saved filters</p>
          <div className="mt-4 space-y-3">
            {filters.map((filter) => (
              <button
                key={filter.filter_id}
                onClick={() => {
                  setJql(filter.jql_query);
                  void runSearch(filter.jql_query);
                }}
                className="soft-panel block w-full rounded-sm px-4 py-3 text-left"
              >
                <p className="text-sm font-semibold text-slate-950">{filter.name}</p>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">{filter.jql_query}</p>
              </button>
            ))}
            {filters.length === 0 ? <p className="text-sm text-slate-500">No saved searches yet.</p> : null}
          </div>
        </aside>
      </section>

      <section className="glass-panel rounded p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-950">Results</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{total} matches</span>
        </div>
        <div className="mt-5 grid gap-3">
          {results.map((issue) => (
            <button key={issue.issue_id} onClick={() => router.push(`/issues/${issue.issue_id}`)} className="interactive-card soft-panel rounded-sm px-4 py-4 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">{issue.issue_key}</span>
                <span className="text-xs font-semibold text-slate-500">{issue.status}</span>
                <span className="text-xs font-semibold text-slate-500">{issue.priority || 'No priority'}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-950">{issue.summary}</p>
            </button>
          ))}
          {!isLoading && results.length === 0 ? <p className="rounded-sm border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No issues matched this query.</p> : null}
        </div>
      </section>
    </div>
  );
}
