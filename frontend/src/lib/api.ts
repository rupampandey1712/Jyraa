import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export type AgentStreamEvent = {
  type: 'status' | 'result' | 'error';
  message?: string;
  detail?: string;
  elapsed_seconds?: number;
  data?: any;
};

async function postStream(
  path: string,
  data: unknown,
  onEvent: (event: AgentStreamEvent) => void
) {
  const token = localStorage.getItem('access_token');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (response.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/login';
    throw new Error('Authentication expired');
  }

  if (!response.ok || !response.body) {
    throw new Error(`Streaming request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as AgentStreamEvent);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as AgentStreamEvent);
  }
}

// Add token interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token refresh (future implementation)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      // In a real app, you would try to refresh the token here
      localStorage.removeItem('access_token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (username: string, password: string) =>
    api.post(
      '/auth/login',
      new URLSearchParams({ username, password }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    ),
  register: (userData: { username: string; email: string; password: string; display_name: string }) =>
    api.post('/auth/register', userData),
};

// User APIs
export const userAPI = {
  getProfile: () => api.get('/users/me'), // We'll add this endpoint
  updateProfile: (data: Partial<{ email: string; display_name: string; avatar_url: string }>) =>
    api.put('/users/me', data),
  search: (params?: { q?: string; limit?: number }) => api.get('/users/search', { params }),
};

// Project APIs
export const projectAPI = {
  getAll: (params?: { skip?: number; limit?: number }) =>
    api.get('/projects', { params }),
  getById: (projectId: number) => api.get(`/projects/${projectId}`),
  create: (data: { project_key: string; name: string; description?: string }) =>
    api.post('/projects', data),
  update: (projectId: number, data: Partial<{ name: string; description: string; is_archived: boolean }>) =>
    api.put(`/projects/${projectId}`, data),
  getIssues: (projectId: number, params?: { skip?: number; limit?: number; assignee_id?: number; status_id?: number; priority_id?: number }) =>
    api.get(`/projects/${projectId}/issues`, { params }),
  getStats: (projectId: number) => api.get(`/projects/${projectId}/stats`),
};

// Issue APIs
export const issueAPI = {
  getAll: (params?: {
    project_key?: string;
    issue_type_name?: string;
    assignee_username?: string;
    status_name?: string;
    priority_name?: string;
    search?: string;
    skip?: number;
    limit?: number;
  }) => api.get('/issues', { params }),
  getPaginated: (params?: { page?: number; page_size?: number; project_key?: string; search?: string }) =>
    api.get('/issues/paginated', { params }),
  advancedSearch: (params: { jql: string; page?: number; page_size?: number }) =>
    api.get('/issues/search', { params }),
  getById: (issueId: number) => api.get(`/issues/${issueId}`),
  getByKey: (issueKey: string) => api.get(`/issues/key/${issueKey}`),
  create: (data: {
    project_key: string;
    issue_type: string;
    summary: string;
    description?: string;
    priority?: string;
    assignee_username?: string;
    auto_assign?: boolean;
    epic_issue_key?: string;
    component_name?: string;
    version_name?: string;
    original_estimate?: number;
    remaining_estimate?: number;
    due_date?: string;
    label_names?: string[];
  }) => api.post('/issues', data),
  update: (issueId: number, data: Partial<{
    project_key: string;
    issue_type: string;
    summary: string;
    description: string;
    priority: string | null;
    status: string;
    assignee_username: string | null;
    component_name: string | null;
    version_name: string | null;
    original_estimate: number;
    remaining_estimate: number;
    due_date: string | null;
    label_names: string[];
  }>) => api.put(`/issues/${issueId}`, data),
  delete: (issueId: number) => api.delete(`/issues/${issueId}`),
  addComment: (issueId: number, body: string) => api.post(`/issues/${issueId}/comments`, { body }),
  getComments: (issueId: number, params?: { skip?: number; limit?: number }) =>
    api.get(`/issues/${issueId}/comments`, { params }),
  addWorklog: (issueId: number, data: { time_spent: number; comment?: string; started_at: string }) =>
    api.post(`/issues/${issueId}/worklogs`, data),
  getWorklogs: (issueId: number, params?: { skip?: number; limit?: number }) =>
    api.get(`/issues/${issueId}/worklogs`, { params }),
  linkIssue: (issueId: number, issue_key_to: string, link_type?: string) =>
    api.post(`/issues/${issueId}/link`, { issue_key_to, link_type }),
  updateEpic: (issueId: number, epic_issue_key: string | null) =>
    api.put(`/issues/${issueId}/epic`, { epic_issue_key }),
};

// Board APIs
export const boardAPI = {
  create: (data: { project_key: string; name: string; description?: string; board_type: string }) =>
    api.post('/boards', data),
  getByProject: (projectId: number, params?: { skip?: number; limit?: number }) =>
    api.get(`/boards/project/${projectId}`, { params }),
  getById: (boardId: number) => api.get(`/boards/${boardId}`),
  update: (boardId: number, data: Partial<{ name: string; description: string; is_archived: boolean }>) =>
    api.put(`/boards/${boardId}`, data),
  addColumn: (boardId: number, data: { name: string; column_type: string; mapped_status_name?: string; sort_order: number; is_editable?: boolean }) =>
    api.post(`/boards/${boardId}/columns`, data),
  getColumns: (boardId: number) => api.get(`/boards/${boardId}/columns`),
  getIssues: (boardId: number) => api.get(`/boards/${boardId}/issues`),
  getSprints: (boardId: number) => api.get(`/boards/${boardId}/sprints`),
  createSprint: (boardId: number, data: { name: string; goal?: string; start_date: string; end_date: string }) =>
    api.post(`/boards/${boardId}/sprints`, { ...data, board_id: boardId }),
  addIssuesToSprint: (sprintId: number, issue_ids: number[]) =>
    api.post(`/boards/sprints/${sprintId}/issues`, { issue_ids }),
  getSprintCapacity: (sprintId: number) => api.get(`/boards/sprints/${sprintId}/capacity`),
};

export const agentAPI = {
  getStatus: () => api.get('/agents/status'),
  runAutomation: (data: { intent?: string; issue_id?: number; board_id?: number }) =>
    api.post('/agents/automation/run', data),
  runAutomationStream: (data: { intent?: string; issue_id?: number; board_id?: number }, onEvent: (event: AgentStreamEvent) => void) =>
    postStream('/agents/automation/run/stream', data, onEvent),
  ask: (message: string) => api.post('/agents/workflow/ask', { message }),
  askStream: (message: string, onEvent: (event: AgentStreamEvent) => void) =>
    postStream('/agents/workflow/ask/stream', { message }, onEvent),
  executePrompt: (prompt: string) => api.post('/agents/prompt/execute', { prompt }),
  executePromptStream: (prompt: string, onEvent: (event: AgentStreamEvent) => void) =>
    postStream('/agents/prompt/execute/stream', { prompt }, onEvent),
  reviewRepository: (data: { repository_url: string; branch?: string; github_token?: string; max_files?: number }) =>
    api.post('/agents/repository/review', data),
  reviewRepositoryStream: (
    data: { repository_url: string; branch?: string; github_token?: string; max_files?: number },
    onEvent: (event: AgentStreamEvent) => void
  ) => postStream('/agents/repository/review/stream', data, onEvent),
  approveAction: (actionId: number) => api.post(`/agents/actions/${actionId}/approve`),
  rejectAction: (actionId: number) => api.post(`/agents/actions/${actionId}/reject`),
};

// Analytics APIs
export const analyticsAPI = {
  overview: (projectId: number, days = 30) =>
    api.get(`/analytics/projects/${projectId}/overview`, { params: { days } }),
  cumulativeFlow: (projectId: number, days = 30) =>
    api.get(`/analytics/projects/${projectId}/cumulative-flow`, { params: { days } }),
  controlChart: (projectId: number, days = 90, rolling_window = 7) =>
    api.get(`/analytics/projects/${projectId}/control-chart`, { params: { days, rolling_window } }),
  createdVsResolved: (projectId: number, days = 60, interval: 'day' | 'week' = 'day') =>
    api.get(`/analytics/projects/${projectId}/created-vs-resolved`, { params: { days, interval } }),
  throughput: (projectId: number, days = 84) =>
    api.get(`/analytics/projects/${projectId}/throughput`, { params: { days } }),
  agingWip: (projectId: number) => api.get(`/analytics/projects/${projectId}/aging-wip`),
  workload: (projectId: number) => api.get(`/analytics/projects/${projectId}/workload`),
  epicProgress: (projectId: number) => api.get(`/analytics/projects/${projectId}/epic-progress`),
  velocity: (boardId: number, limit = 8, unit: 'count' | 'hours' = 'count') =>
    api.get(`/analytics/boards/${boardId}/velocity`, { params: { limit, unit } }),
  burndown: (sprintId: number, unit: 'count' | 'hours' = 'count') =>
    api.get(`/analytics/sprints/${sprintId}/burndown`, { params: { unit } }),
};

// Filter APIs
export const filterAPI = {
  getAll: (project_id?: number) => api.get('/filters', { params: { project_id } }),
  getById: (filter_id: number) => api.get(`/filters/${filter_id}`),
  create: (data: { name: string; jql_query: string; project_id?: number; is_favorite?: boolean; is_shared?: boolean }) =>
    api.post('/filters', data),
  update: (filter_id: number, data: Partial<{ name: string; jql_query: string; is_favorite: boolean; is_shared: boolean }>) =>
    api.put(`/filters/${filter_id}`, data),
  delete: (filter_id: number) => api.delete(`/filters/${filter_id}`),
};

// Webhook APIs
export const webhookAPI = {
  getAll: (project_id: number) => api.get('/webhooks', { params: { project_id } }),
  create: (data: { project_id: number; name: string; url: string; events: string[]; secret?: string }) =>
    api.post('/webhooks', data),
  update: (webhook_id: number, data: Partial<{ name: string; url: string; events: string[]; is_active: boolean }>) =>
    api.put(`/webhooks/${webhook_id}`, data),
  delete: (webhook_id: number) => api.delete(`/webhooks/${webhook_id}`),
};

// Template APIs
export const templateAPI = {
  getAll: (project_id?: number) => api.get('/templates', { params: { project_id } }),
  getById: (template_id: number) => api.get(`/templates/${template_id}`),
  create: (data: { name: string; issue_type_id: number; project_id?: number; summary_template?: string; description_template?: string }) =>
    api.post('/templates', data),
  update: (template_id: number, data: Partial<{ name: string; summary_template: string; description_template: string }>) =>
    api.put(`/templates/${template_id}`, data),
  delete: (template_id: number) => api.delete(`/templates/${template_id}`),
};

// Dashboard APIs
export const dashboardAPI = {
  getAll: () => api.get('/dashboards'),
  getById: (dashboard_id: number) => api.get(`/dashboards/${dashboard_id}`),
  create: (data: { name: string; description?: string; is_shared?: boolean; layout_config?: string }) =>
    api.post('/dashboards', data),
  addGadget: (dashboard_id: number, data: { gadget_type: string; title: string; config?: string; width?: number; height?: number }) =>
    api.post(`/dashboards/${dashboard_id}/gadgets`, data),
  deleteGadget: (dashboard_id: number, gadget_id: number) => api.delete(`/dashboards/${dashboard_id}/gadgets/${gadget_id}`),
};

// Roadmap APIs
export const roadmapAPI = {
  getAll: (project_id?: number) => api.get('/roadmaps', { params: { project_id } }),
  getById: (roadmap_id: number) => api.get(`/roadmaps/${roadmap_id}`),
  create: (data: { project_id: number; name: string; description?: string; start_date?: string; end_date?: string }) =>
    api.post('/roadmaps', data),
  addItem: (roadmap_id: number, data: { issue_id?: number; name?: string; description?: string; start_date: string; end_date: string; status?: string; color_hex?: string }) =>
    api.post(`/roadmaps/${roadmap_id}/items`, data),
  getGantt: (roadmap_id: number) => api.get(`/roadmaps/${roadmap_id}/gantt`),
};

// Permission / ACL APIs
export const permissionAPI = {
  getPermissions: () => api.get('/permissions'),
  getProjectRoles: (project_id: number) => api.get(`/permissions/projects/${project_id}/roles`),
  upsertProjectRole: (project_id: number, data: { user_id: number; role_type: string; permissions: string[] }) =>
    api.post(`/permissions/projects/${project_id}/roles`, data),
};

// Notification APIs
export const notificationAPI = {
  getAll: (params?: { unread_only?: boolean; skip?: number; limit?: number }) =>
    api.get('/notifications', { params }),
  markRead: (notification_id: number) => api.put(`/notifications/${notification_id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

// Audit APIs
export const auditAPI = {
  getAll: (params?: { entity_type?: string; entity_id?: number; skip?: number; limit?: number }) =>
    api.get('/audit', { params }),
};

// Background task APIs
export const taskAPI = {
  getAll: (params?: { status?: string; skip?: number; limit?: number }) => api.get('/tasks', { params }),
  process: () => api.post('/tasks/process'),
  getEmails: (status?: string) => api.get('/tasks/emails', { params: { status } }),
};

// Bulk Operations APIs
export const bulkAPI = {
  updateStatus: (issue_ids: number[], status: string) => api.post('/bulk/issues/status', { issue_ids, status }),
  updateAssignee: (issue_ids: number[], assignee_username: string | null) => api.post('/bulk/issues/assignee', { issue_ids, assignee_username }),
  deleteIssues: (issue_ids: number[]) => api.post('/bulk/issues/delete', { issue_ids }),
  addLabels: (issue_ids: number[], labels: string[]) => api.post('/bulk/issues/labels', { issue_ids, labels }),
};

// Attachment APIs
export const attachmentAPI = {
  upload: (issue_id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/issues/${issue_id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getByIssue: (issue_id: number) => api.get(`/issues/${issue_id}/attachments`),
  delete: (attachment_id: number) => api.delete(`/issues/attachments/${attachment_id}`),
  download: (attachment_id: number) =>
    api.get(`/issues/attachments/${attachment_id}/download`, { responseType: 'blob' }),
};

// Default export
export default api;
