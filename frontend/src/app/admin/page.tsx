'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auditAPI, permissionAPI, projectAPI, taskAPI, templateAPI, userAPI, webhookAPI } from '@/lib/api';
import { AuditEvent, BackgroundTask, Permission, Project, ProjectRole, User } from '@/types';
import { useAuth } from '@/lib/auth-context';

export default function AdminPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('https://example.com/webhook');
  const [templateName, setTemplateName] = useState('Bug report');

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    void loadAdminData();
  }, [token, router]);

  useEffect(() => {
    if (selectedProjectId) void loadProjectRoles(selectedProjectId);
  }, [selectedProjectId]);

  const loadAdminData = async () => {
    const [projectResponse, userResponse, permissionResponse, auditResponse, taskResponse] = await Promise.all([
      projectAPI.getAll(),
      userAPI.search({ limit: 25 }),
      permissionAPI.getPermissions(),
      auditAPI.getAll({ limit: 25 }),
      taskAPI.getAll({ limit: 25 }),
    ]);
    const projectItems = projectResponse.data as Project[];
    const userItems = userResponse.data as User[];
    setProjects(projectItems);
    setUsers(userItems);
    setPermissions(permissionResponse.data as Permission[]);
    setAudit(auditResponse.data as AuditEvent[]);
    setTasks(taskResponse.data as BackgroundTask[]);
    setSelectedProjectId(projectItems[0]?.project_id || null);
    setSelectedUserId(userItems[0]?.user_id || null);
  };

  const loadProjectRoles = async (projectId: number) => {
    const response = await permissionAPI.getProjectRoles(projectId);
    setRoles(response.data as ProjectRole[]);
  };

  const grantMemberRole = async () => {
    if (!selectedProjectId || !selectedUserId) return;
    await permissionAPI.upsertProjectRole(selectedProjectId, {
      user_id: selectedUserId,
      role_type: 'member',
      permissions: ['project.read', 'issue.create', 'issue.update'],
    });
    await loadProjectRoles(selectedProjectId);
  };

  const createWebhook = async () => {
    if (!selectedProjectId) return;
    await webhookAPI.create({
      project_id: selectedProjectId,
      name: 'Issue events',
      url: webhookUrl,
      events: ['issue.created', 'issue.updated'],
    });
  };

  const createTemplate = async () => {
    if (!selectedProjectId) return;
    await templateAPI.create({
      project_id: selectedProjectId,
      name: templateName,
      issue_type_id: 4,
      summary_template: '[Bug] ',
      description_template: 'Steps to reproduce:\n\nExpected:\n\nActual:\n',
    });
  };

  const processTasks = async () => {
    await taskAPI.process();
    const response = await taskAPI.getAll({ limit: 25 });
    setTasks(response.data as BackgroundTask[]);
  };

  return (
    <div className="space-y-6">
      <section className="hero-panel rounded p-6">
        <p className="eyebrow text-rose-600">Admin and integrations</p>
        <h2 className="app-title mt-2 text-3xl font-semibold text-slate-950">Control room</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Manage ACLs, webhooks, issue templates, audit events, email queue tasks, and background processing.
        </p>
      </section>

      <section className="glass-panel rounded p-6">
        <div className="flex flex-wrap gap-3">
          <select value={selectedProjectId || ''} onChange={(event) => setSelectedProjectId(Number(event.target.value))} className="rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm">
            {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.project_key} - {project.name}</option>)}
          </select>
          <select value={selectedUserId || ''} onChange={(event) => setSelectedUserId(Number(event.target.value))} className="rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm">
            {users.map((user) => <option key={user.user_id} value={user.user_id}>{user.display_name} (@{user.username})</option>)}
          </select>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="glass-panel rounded p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-sky-600">Advanced ACLs</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Project roles</h3>
            </div>
            <button onClick={() => void grantMemberRole()} className="button-primary rounded-sm px-4 py-2 text-sm font-semibold text-white">Grant member</button>
          </div>
          <div className="mt-5 space-y-3">
            {roles.map((role) => (
              <div key={role.role_id} className="soft-panel rounded-sm p-4">
                <p className="text-sm font-semibold text-slate-950">{role.display_name || role.username}</p>
                <p className="mt-1 text-xs text-slate-500">{role.role_type} | {role.permissions.join(', ') || 'No explicit permissions'}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-sm bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Available permissions</p>
            <p className="mt-2 text-xs leading-6 text-slate-600">{permissions.map((permission) => permission.permission_key).join(', ')}</p>
          </div>
        </div>

        <div className="glass-panel rounded p-6">
          <p className="eyebrow text-emerald-600">Webhooks and templates</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">Integration setup</h3>
          <div className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">Webhook URL</label>
              <input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} className="mt-2 w-full rounded-sm border border-slate-300 px-4 py-2.5 text-sm" />
              <button onClick={() => void createWebhook()} className="button-secondary mt-3 rounded-sm px-4 py-2 text-sm font-semibold">Create webhook</button>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Template name</label>
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="mt-2 w-full rounded-sm border border-slate-300 px-4 py-2.5 text-sm" />
              <button onClick={() => void createTemplate()} className="button-secondary mt-3 rounded-sm px-4 py-2 text-sm font-semibold">Create bug template</button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="glass-panel rounded p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow text-amber-600">Background tasks</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Email and notification queue</h3>
            </div>
            <button onClick={() => void processTasks()} className="button-primary rounded-sm px-4 py-2 text-sm font-semibold text-white">Process</button>
          </div>
          <div className="mt-5 space-y-3">
            {tasks.map((task) => (
              <div key={task.task_id} className="soft-panel rounded-sm p-4">
                <p className="text-sm font-semibold text-slate-950">#{task.task_id} {task.task_type}</p>
                <p className="mt-1 text-xs text-slate-500">{task.status} | {task.error_message || 'No error'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded p-6">
          <p className="eyebrow text-violet-600">Audit log</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">Recent changes</h3>
          <div className="mt-5 space-y-3">
            {audit.map((event) => (
              <div key={event.audit_id} className="soft-panel rounded-sm p-4">
                <p className="text-sm font-semibold text-slate-950">{event.action_type} {event.entity_type}</p>
                <p className="mt-1 text-xs text-slate-500">Entity #{event.entity_id || 'n/a'} | {event.username || 'System'} | {new Date(event.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
