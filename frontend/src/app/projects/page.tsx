'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { projectAPI } from '@/lib/api';
import { ArrowRightIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Project } from '@/types';
import { useAuth } from '@/lib/auth-context';

/** A project found by searching, which may be one the user is not part of. */
interface SearchResult {
  project_id: number;
  project_key: string;
  name: string;
  description: string | null;
  is_member: boolean;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { token } = useAuth();

  const fetchProjects = useCallback(async () => {
    try {
      const response = await projectAPI.getAll();
      setProjects(response.data as Project[]);
    } catch (caught) {
      const detail = caught as { response?: { data?: { detail?: string } } };
      setError(detail.response?.data?.detail || 'Could not load your projects.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    void fetchProjects();
  }, [token, router, fetchProjects]);

  // Searching is the deliberate act that surfaces projects nobody assigned you to.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setIsSearching(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await projectAPI.search(term);
        setResults(response.data as SearchResult[]);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  const open = (projectId: number) => router.push(`/projects/${projectId}`);

  if (isLoading) {
    return (
      <div className="glass-panel rounded px-6 py-16 text-center text-sm text-slate-500">
        Loading projects…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* The shell already renders the page title and the New project action. */}
      <p className="max-w-3xl text-sm text-slate-600">
        The projects you lead, hold a role in, or have work assigned in. Search to find any other project in the
        organisation.
      </p>

      <div className="glass-panel rounded p-4">
        <label className="relative block">
          <span className="sr-only">Search all projects</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search all projects by key or name"
            className="h-9 w-full rounded-sm pl-8 pr-3 text-sm"
          />
        </label>
        {query.trim().length === 1 ? (
          <p className="mt-2 text-xs text-slate-500">Keep typing to search.</p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-sm border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {results !== null ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Search results {isSearching ? <span className="font-normal text-slate-500">· searching…</span> : null}
          </h3>
          {results.length === 0 && !isSearching ? (
            <div className="glass-panel rounded px-5 py-10 text-center text-sm text-slate-500">
              No project matches “{query.trim()}”.
            </div>
          ) : (
            <ul className="glass-panel divide-y divide-slate-200 rounded">
              {results.map((result) => (
                <li key={result.project_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="ado-pill shrink-0">{result.project_key}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{result.name}</p>
                    {result.description ? (
                      <p className="truncate text-xs text-slate-500">{result.description}</p>
                    ) : null}
                  </div>
                  {result.is_member ? (
                    <button onClick={() => open(result.project_id)} className="button-secondary h-7 px-2.5 text-xs">
                      Open
                    </button>
                  ) : (
                    <span
                      className="text-xs text-slate-500"
                      title="You have no role in this project and no work assigned in it."
                    >
                      Not a member
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Your projects</h3>
        {projects.length === 0 ? (
          <div className="glass-panel rounded border-dashed p-10 text-center">
            <h4 className="text-base font-semibold text-slate-900">No projects assigned to you</h4>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              A project shows up here once you lead it, are given a role in it, or have an issue assigned to you in
              it. Use the search above to find an existing project, or create your own.
            </p>
            <button
              onClick={() => router.push('/projects/new')}
              className="button-primary mt-5 inline-flex h-8 items-center px-3 text-[13px]"
            >
              <PlusIcon className="mr-1.5 h-4 w-4" />
              New project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.project_id}
                onClick={() => open(project.project_id)}
                className="interactive-card glass-panel rounded p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="ado-pill">{project.project_key}</span>
                  {project.is_archived ? <span className="ado-pill">Archived</span> : null}
                </div>
                <h4 className="mt-2.5 text-sm font-semibold text-slate-950">{project.name}</h4>
                {project.description ? (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">{project.description}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-xs text-slate-500">
                    Created {new Date(project.created_at).toLocaleDateString()}
                  </span>
                  <span className="inline-flex items-center text-xs font-medium text-sky-700">
                    Open
                    <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
