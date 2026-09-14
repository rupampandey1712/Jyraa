'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { boardAPI, projectAPI, roadmapAPI } from '@/lib/api';
import { Board, Issue, Project, Roadmap, RoadmapItem, Sprint } from '@/types';
import { useAuth } from '@/lib/auth-context';

const today = new Date().toISOString().slice(0, 10);
const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function PlanningPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [selectedRoadmap, setSelectedRoadmap] = useState<Roadmap | null>(null);
  const [sprintName, setSprintName] = useState('Next sprint');
  const [roadmapName, setRoadmapName] = useState('Release roadmap');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    void loadProjects();
  }, [token, router]);

  useEffect(() => {
    if (selectedProjectId) void loadProjectPlanning(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedBoardId) void loadSprints(selectedBoardId);
  }, [selectedBoardId]);

  const selectedProject = useMemo(() => projects.find((project) => project.project_id === selectedProjectId), [projects, selectedProjectId]);

  const loadProjects = async () => {
    try {
      const response = await projectAPI.getAll();
      const items = response.data as Project[];
      setProjects(items);
      setSelectedProjectId(items[0]?.project_id || null);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError('Failed to load projects.');
    }
  };

  const loadProjectPlanning = async (projectId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const [boardResult, issueResult, roadmapResult] = await Promise.allSettled([
        boardAPI.getByProject(projectId),
        projectAPI.getIssues(projectId),
        roadmapAPI.getAll(projectId),
      ]);

      if (boardResult.status === 'fulfilled') {
        const boardItems = boardResult.value.data as Board[];
        setBoards(boardItems);
        setSelectedBoardId(boardItems[0]?.board_id || null);
      } else {
        setBoards([]);
        setSelectedBoardId(null);
        const status = (boardResult.reason as any)?.response?.status;
        if (status === 403) {
          setError('Project access required: You do not have permission to view boards or planning for this project. Please select another project or sign in as an admin.');
        } else {
          setError((boardResult.reason as any)?.response?.data?.detail || 'Failed to load project boards.');
        }
      }

      if (issueResult.status === 'fulfilled') {
        setIssues(issueResult.value.data as Issue[]);
      } else {
        setIssues([]);
      }

      if (roadmapResult.status === 'fulfilled') {
        setRoadmaps(roadmapResult.value.data as Roadmap[]);
      } else {
        setRoadmaps([]);
      }
    } catch (err: any) {
      console.error('Failed to load project planning:', err);
      setError(err?.response?.data?.detail || 'An unexpected error occurred while loading planning data.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSprints = async (boardId: number) => {
    try {
      const response = await boardAPI.getSprints(boardId);
      setSprints(response.data as Sprint[]);
    } catch (err) {
      console.error('Failed to load sprints:', err);
      setSprints([]);
    }
  };

  const createSprint = async () => {
    if (!selectedBoardId) return;
    try {
      await boardAPI.createSprint(selectedBoardId, { name: sprintName, start_date: today, end_date: inTwoWeeks });
      await loadSprints(selectedBoardId);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create sprint. Make sure you have permission.');
    }
  };

  const createRoadmap = async () => {
    if (!selectedProjectId) return;
    try {
      const response = await roadmapAPI.create({ project_id: selectedProjectId, name: roadmapName, start_date: today, end_date: inTwoWeeks });
      const roadmap = response.data as Roadmap;
      setSelectedRoadmap({ ...roadmap, items: [] });
      await loadProjectPlanning(selectedProjectId);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create roadmap. Make sure you have permission.');
    }
  };

  const openRoadmap = async (roadmapId: number) => {
    try {
      const response = await roadmapAPI.getById(roadmapId);
      setSelectedRoadmap(response.data as Roadmap);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to open roadmap.');
    }
  };

  const addIssueToRoadmap = async (issue: Issue) => {
    if (!selectedRoadmap) return;
    try {
      await roadmapAPI.addItem(selectedRoadmap.roadmap_id, {
        issue_id: issue.issue_id,
        name: issue.summary,
        start_date: today,
        end_date: inTwoWeeks,
        status: issue.status.toLowerCase().replaceAll(' ', '_'),
      });
      await openRoadmap(selectedRoadmap.roadmap_id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to add issue to roadmap.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="hero-panel rounded p-6">
        <p className="eyebrow text-emerald-600">Sprint planning and roadmaps</p>
        <h2 className="app-title mt-2 text-3xl font-semibold text-slate-950">Planning room</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Plan sprint capacity, create roadmaps, and visualize timeline items in a lightweight Gantt-style layout.
        </p>
      </section>

      <section className="glass-panel rounded p-6">
        <div className="flex flex-wrap gap-3">
          <select value={selectedProjectId || ''} onChange={(event) => setSelectedProjectId(Number(event.target.value))} className="rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm">
            {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.project_key} - {project.name}</option>)}
          </select>
          <select value={selectedBoardId || ''} onChange={(event) => setSelectedBoardId(Number(event.target.value))} className="rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm">
            {boards.map((board) => <option key={board.board_id} value={board.board_id}>{board.name}</option>)}
          </select>
        </div>
      </section>

      {error && (
        <div className="rounded-sm border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Notice</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="glass-panel rounded p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-sky-600">Sprint capacity</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Sprints for {selectedProject?.project_key || 'project'}</h3>
            </div>
            <div className="flex gap-2">
              <input value={sprintName} onChange={(event) => setSprintName(event.target.value)} className="rounded-sm border border-slate-300 px-3 py-2 text-sm" />
              <button onClick={() => void createSprint()} className="button-primary rounded-sm px-4 py-2 text-sm font-semibold text-white">Create</button>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {sprints.map((sprint) => (
              <div key={sprint.sprint_id} className="soft-panel rounded-sm p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{sprint.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{sprint.start_date} to {sprint.end_date}</p>
                  </div>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{sprint.sprint_status}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-sm bg-white px-3 py-2"><p className="font-semibold">{sprint.issue_count || 0}</p><p className="text-xs text-slate-500">Issues</p></div>
                  <div className="rounded-sm bg-white px-3 py-2"><p className="font-semibold">{sprint.planned_capacity_hours || 0}h</p><p className="text-xs text-slate-500">Planned</p></div>
                  <div className="rounded-sm bg-white px-3 py-2"><p className="font-semibold">{sprint.remaining_capacity_hours || 0}h</p><p className="text-xs text-slate-500">Remaining</p></div>
                </div>
              </div>
            ))}
            {sprints.length === 0 ? <p className="rounded-sm border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No sprints yet.</p> : null}
          </div>
        </div>

        <div className="glass-panel rounded p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-amber-600">Roadmaps</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Gantt timeline</h3>
            </div>
            <div className="flex gap-2">
              <input value={roadmapName} onChange={(event) => setRoadmapName(event.target.value)} className="rounded-sm border border-slate-300 px-3 py-2 text-sm" />
              <button onClick={() => void createRoadmap()} className="button-primary rounded-sm px-4 py-2 text-sm font-semibold text-white">Create</button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {roadmaps.map((roadmap) => (
              <button key={roadmap.roadmap_id} onClick={() => void openRoadmap(roadmap.roadmap_id)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{roadmap.name}</button>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {(selectedRoadmap?.items || []).map((item: RoadmapItem) => (
              <div key={item.item_id} className="rounded-sm border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-950">{item.issue_key || item.name}</span>
                  <span className="text-xs text-slate-500">{item.start_date} to {item.end_date}</span>
                </div>
                <div className="mt-3 h-3 rounded-full bg-slate-100">
                  <div className="h-3 w-2/3 rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" />
                </div>
              </div>
            ))}
            {selectedRoadmap ? (
              <div className="rounded-sm border border-dashed border-slate-300 p-4">
                <p className="text-sm font-semibold text-slate-900">Add issues to {selectedRoadmap.name}</p>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {issues.slice(0, 10).map((issue) => (
                    <button key={issue.issue_id} onClick={() => void addIssueToRoadmap(issue)} className="block w-full rounded-sm bg-white px-3 py-2 text-left text-xs text-slate-700">
                      {issue.issue_key} - {issue.summary}
                    </button>
                  ))}
                </div>
              </div>
            ) : <p className="rounded-sm border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Select or create a roadmap.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
