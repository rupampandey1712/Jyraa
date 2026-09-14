'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { projectAPI } from '@/lib/api';
import { ArrowRightIcon, PencilIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Project } from '@/types';
import { useAuth } from '@/lib/auth-context';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { token } = useAuth();

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    fetchProjects();
  }, [token, router]);

  const fetchProjects = async () => {
    try {
      const response = await projectAPI.getAll();
      setProjects(response.data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectClick = (projectId: number) => {
    router.push(`/projects/${projectId}`);
  };

  const handleCreateProject = () => {
    router.push('/projects/new');
  };

  if (isLoading) {
    return (
      <div className="rounded border border-slate-200 bg-white/85 px-6 py-16 text-center text-sm text-slate-500 shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
        Loading projects...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="hero-panel flex flex-col gap-4 rounded p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow text-sky-600">Project library</p>
          <h2 className="app-title mt-2 text-3xl font-semibold text-slate-950">Projects</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Manage delivery spaces, track ownership, and move from planning into execution with less UI friction.</p>
        </div>
        <button
          onClick={handleCreateProject}
          className="button-primary inline-flex items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold text-white"
        >
          <PlusIcon className="mr-2 h-5 w-5" />
          Create Project
        </button>
      </div>

      <div>
        {projects.length === 0 ? (
          <div className="glass-panel rounded border border-dashed border-slate-300 p-10 text-center">
            <h3 className="text-lg font-medium text-slate-900 mb-2">No projects yet</h3>
            <p className="text-slate-500 mb-6">
              Get started by creating your first project.
            </p>
            <button
              onClick={handleCreateProject}
              className="button-primary inline-flex items-center rounded-sm px-4 py-3 text-sm font-semibold text-white"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.project_id}
                className="interactive-card glass-panel cursor-pointer rounded"
                onClick={() => handleProjectClick(project.project_id)}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                          {project.project_key}
                        </span>
                        {project.is_archived && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100 text-slate-700">
                            Archived
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-950">
                        {project.name}
                      </h3>
                    </div>
                    <button className="rounded-sm p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                      <PencilIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {project.description && (
                    <p className="mt-3 text-sm leading-6 text-slate-600 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="mt-5 flex items-center justify-between border-t border-slate-200/80 pt-4">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Created: {new Date(project.created_at).toLocaleDateString()}
                    </span>
                    <span className="inline-flex items-center text-sm font-medium text-sky-700 hover:text-sky-600">
                      View boards
                      <ArrowRightIcon className="ml-1 h-4 w-4" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
