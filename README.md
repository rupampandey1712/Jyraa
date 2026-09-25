# ZYRAA - Project Management and Issue Tracking

ZYRAA is a full-stack Jira-like project management system built with **FastAPI**, **SQL Server**, **SQLAlchemy**, **Next.js 14**, **TypeScript**, and **Tailwind CSS**.

It supports project and board management, issue tracking, sprint planning, roadmaps, dashboards, saved filters, attachments, notifications, permissions, audit logs, background tasks, and Docker-based deployment.

## Current Features

- **Authentication and users**: JWT login/register flow, current-user profile APIs, user search, and profile updates.
- **Projects and boards**: Project CRUD, Kanban/Scrum boards, board columns, project stats, and board issue grouping.
- **Issue tracking**: Issue CRUD, issue keys, priorities, statuses, assignees, labels, components, versions, epics, comments, worklogs, and issue links.
- **Attachments**: Upload, list, download, and delete files linked to issues.
- **Advanced search**: JQL-like issue search plus reusable filters and saved searches.
- **Project visibility**: a project is listed only for users who lead it, hold a role in it, or have an issue in it
  assigned to or reported by them. Any other project is reachable only through an explicit search, which returns its
  name and key but not its contents.
- **Time tracking**: log work against an issue with Jira's remaining-estimate options (adjust automatically, leave,
  set to, reduce by). Logged hours accumulate on the issue and the remaining estimate burns down, floored at zero so
  an overrun shows as time spent exceeding the original estimate.
- **Requirements documents**: upload a PDF, Word, Markdown, text, JSON, YAML, or CSV specification and an agent
  proposes the epics and the stories beneath them. The breakdown is edited and approved before anything is created.
- **Dashboards and gadgets**: Dashboard CRUD with configurable gadget blocks, each rendering a live chart scoped to a project or board.
- **Delivery analytics**: Burndown, velocity, cumulative flow, cycle-time control chart, created vs resolved, throughput, aging WIP, workload, and epic progress, computed from recorded status transitions.
- **Sprint planning**: Sprint creation, issue assignment to sprints, and capacity summaries by assignee.
- **Roadmaps and Gantt views**: Roadmap CRUD, timeline items, issue-to-roadmap linking, and Gantt-style API output.
- **Permissions and ACLs**: Project roles, seeded permission keys, role-permission assignments, and project admin role setup on project creation.
- **Notifications and email queue**: In-app notifications, email queue records, and background task processing endpoints.
- **Webhooks and templates**: Project webhooks, webhook test calls, and issue template CRUD.
- **Bulk operations**: Bulk issue status updates, assignee changes, deletes, and label additions.
- **Audit logging**: Audit records for important issue mutations with queryable audit endpoints.
- **Rate limiting**: API middleware that tracks requests per IP and endpoint.
- **Docker deployment**: Compose stack for SQL Server, Redis, backend, frontend, and nginx.

## Tech Stack

### Backend

- FastAPI
- SQLAlchemy 2
- SQL Server via PyODBC
- Pydantic v2
- JWT authentication
- Uvicorn

### Frontend

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Axios
- Heroicons

### Infrastructure

- Docker Compose
- SQL Server 2022 container
- Redis container
- nginx reverse proxy

## Project Structure

```text
Jyraa/
+-- backend/
|   +-- app/
|   |   +-- api/v1/
|   |   |   +-- agents.py
|   |   |   +-- audit.py
|   |   |   +-- auth.py
|   |   |   +-- boards.py
|   |   |   +-- bulk.py
|   |   |   +-- dashboards.py
|   |   |   +-- filters.py
|   |   |   +-- issues.py
|   |   |   +-- notifications.py
|   |   |   +-- permissions.py
|   |   |   +-- projects.py
|   |   |   +-- roadmaps.py
|   |   |   +-- tasks.py
|   |   |   +-- templates.py
|   |   |   +-- users.py
|   |   |   +-- webhooks.py
|   |   +-- crud/
|   |   +-- middleware/
|   |   +-- models/
|   |   +-- schemas/
|   |   +-- services/
|   |   +-- config.py
|   |   +-- database.py
|   |   +-- main.py
|   +-- Dockerfile
|   +-- requirements.txt
+-- database/
|   +-- sample_data.sql
|   +-- schema.sql
+-- docker/
|   +-- docker-compose.yml
|   +-- nginx.conf
+-- docs/
+-- frontend/
|   +-- src/
|   |   +-- app/
|   |   |   +-- admin/
|   |   |   +-- agents/
|   |   |   +-- boards/
|   |   |   +-- dashboards/
|   |   |   +-- issues/
|   |   |   +-- planning/
|   |   |   +-- projects/
|   |   |   +-- search/
|   |   +-- components/
|   |   +-- lib/
|   |   +-- types/
|   +-- package.json
|   +-- tsconfig.json
+-- README.md
```

## Quick Start

### Prerequisites

- Python 3.11 recommended
- Node.js 18+
- SQL Server 2019+ or Docker
- ODBC Driver 18 for SQL Server

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend is available at:

- API root: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- OpenAPI schema: `http://localhost:8000/openapi.json`

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend is available at `http://localhost:3000`.

### Docker Compose

```powershell
cd docker
docker compose up --build
```

The Docker stack includes SQL Server, Redis, the FastAPI backend, the Next.js frontend, and nginx.

## Environment Variables

### Backend

```environment
DATABASE_SERVER=mssql+pyodbc://@localhost\SQLEXPRESS02/JiraDB?driver=ODBC+Driver+18+for+SQL+Server&trusted_connection=yes&TrustServerCertificate=yes
DATABASE_NAME=JiraDB
SECRET_KEY=change-this-secret-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
FRONTEND_URL=http://localhost:3000
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_API_KEY=
NIM_API_KEY=
NIM_MODEL=moonshotai/kimi-k2.6
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_SENDER_EMAIL=
SMTP_USE_TLS=true
```

### Frontend

```environment
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Frontend Routes

- `/` - workspace dashboard
- `/projects` - project directory
- `/projects/new` - create project
- `/projects/[projectId]` - project detail, boards, stats, and issues
- `/boards` - board directory
- `/boards/[boardId]` - board execution view
- `/issues/[issueId]` - issue detail, comments, worklogs, attachments, assignee, and epic link
- `/search` - JQL-like search and saved filters
- `/planning` - sprint capacity and roadmaps
- `/analytics` - delivery analytics: flow, cycle time, throughput, burndown, and velocity
- `/dashboards` - dashboard and gadget management
- `/admin` - ACLs, webhooks, templates, audit logs, and background tasks
- `/agents` - agent workflow controls
- `/login` and `/register` - authentication

## API Summary

All versioned API routes are mounted under `/api/v1`.

- `auth`: login and registration
- `users`: user listing, profile, profile update, and search
- `projects`: project CRUD, project issues, project stats
- `boards`: board CRUD, columns, board issues, sprints, sprint capacity
- `issues`: issue CRUD, comments, worklogs, links, epics, attachments, pagination, advanced search
- `filters`: saved search CRUD
- `dashboards`: dashboard and gadget CRUD
- `roadmaps`: roadmap CRUD, roadmap items, Gantt data
- `permissions`: permission list and project role assignment
- `notifications`: notification list and mark-read actions
- `webhooks`: webhook CRUD and test delivery
- `templates`: issue template CRUD
- `bulk`: bulk issue operations
- `audit`: audit event listing
- `tasks`: background task and email queue visibility
- `agents`: AI/automation workflows
- `analytics`: delivery metrics per project, board, and sprint
- `projects/search`: find projects outside your own list
- `agents/documents/plan` and `agents/documents/apply`: requirements document to epics and stories

## Database Notes

The SQL Server schema lives in `database/schema.sql`. It includes the core issue tracking tables plus advanced feature tables such as:

- `issue_attachments`
- `project_roles`
- `permissions`
- `role_permissions`
- `notifications`
- `webhooks`
- `issue_templates`
- `filters`
- `dashboards`
- `dashboard_gadgets`
- `roadmaps`
- `roadmap_items`
- `audit_log`
- `api_rate_limits`
- `email_queue`
- `background_tasks`

### Status history and analytics

Analytics reads status transitions from `issue_history`. Rows are written whenever an issue's status, assignee,
priority, or type changes through the issue API or a bulk operation. Issues that changed before history recording
existed have no rows, so their transition times are reconstructed from `created_at` and `updated_at`; every analytics
response reports this in a `coverage` object, and the charts label the result as estimated rather than measured.
Coverage improves on its own as work moves through the system.

For a brand-new database, the FastAPI startup flow can create ORM-managed tables with `Base.metadata.create_all`. For an existing database, apply schema changes manually or through migrations because `create_all` does not alter existing tables.

## Verification

The current implementation was checked with:

```powershell
cd backend
.\.venv\Scripts\python.exe tests\test_analytics_service.py
.\.venv\Scripts\python.exe tests\test_issue_history_recording.py
.\.venv\Scripts\python.exe tests\test_workflow_rules.py
cd ..
python -m compileall backend\app
python -c "from app.main import app; print('backend app import ok')"
python -c "import app.models; from sqlalchemy.orm import configure_mappers; configure_mappers(); print('mappers ok')"
cd frontend
npm run type-check
npm run build
cd ..
docker compose -f docker\docker-compose.yml config
```

The SQLAlchemy mapper validation may show existing overlap warnings for assignment/code-review relationships, but mapper configuration succeeds.

## Additional Documentation

- `docs/ADVANCED_IMPLEMENTATION_CHANGES.md` - detailed record of the advanced feature implementation.
- `docs/MCP_IMPLEMENTATION_GUIDE.md` - MCP coding, request flow, configuration, and extension guide.
- `docs/SETUP.md` - additional setup notes.
- `docs/BACKEND_DEBUG_SETUP.md` - backend debugging notes.
- `docs/ZYRAA_Backend_Handbook.html` and `docs/ZYRAA_Backend_Handbook.pdf` - generated backend handbook.

## License

MIT
