'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { projectAPI } from '@/lib/api';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function CreateProjectPage() {
  const [projectKey, setProjectKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await projectAPI.create({
        project_key: projectKey.toUpperCase(),
        name,
        description: description || undefined,
      });

      const project = response.data;
      router.push(`/projects/${project.project_id}`);
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Failed to create project');
      setIsLoading(false);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Auto-uppercase project key
    e.currentTarget.value = e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="hero-panel rounded p-6 sm:p-8">
        <div className="rounded border border-white/70 bg-white/78 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
            <button
              onClick={() => router.back()}
              className="mb-6 inline-flex items-center text-sm text-slate-500 transition hover:text-slate-700"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back to Projects
            </button>

            <p className="eyebrow text-sky-600">Project setup</p>
            <h2 className="app-title mb-3 mt-2 text-3xl font-bold text-slate-950">Create Project</h2>
            <p className="mb-6 max-w-2xl text-sm leading-7 text-slate-600">
              Give the project a strong identity and a clean description so the workspace feels intentional from the first screen.
            </p>

            {error && (
              <div className="mb-6 rounded-sm border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="project_key" className="block text-sm font-medium text-slate-700">
                  Project Key <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <input
                    id="project_key"
                    name="project_key"
                    type="text"
                    required
                    maxLength={20}
                    value={projectKey}
                    onChange={(e) => setProjectKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    onKeyUp={handleKeyUp}
                    placeholder="e.g., PROJ"
                    className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 font-mono uppercase text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Unique identifier for your project (uppercase letters and numbers only)
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter project name"
                    className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700">
                  Description
                </label>
                <div className="mt-1">
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the project"
                    className="block w-full rounded-sm border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isLoading || !projectKey || !name}
                  className="button-primary flex w-full justify-center rounded-sm px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? 'Creating project...' : 'Create Project'}
                </button>
              </div>
            </form>
        </div>
      </div>
    </div>
  );
}
