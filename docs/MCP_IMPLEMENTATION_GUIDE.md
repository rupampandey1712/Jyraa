# MCP Implementation Guide

This document explains the MCP work added to ZYRAA: what MCP is, where the code lives, how requests reach the MCP tools, and how to extend it safely.

## What MCP Does Here

MCP means Model Context Protocol. It gives AI clients a standard way to call tools, read resources, and use prompts from this app.

In ZYRAA, MCP exposes project-management data from the backend so an AI client can answer questions like:

- List my projects.
- Search issues in a project.
- Show one issue with comments and links.
- List boards, columns, and sprints.
- Generate an issue triage prompt.

The current MCP implementation is intentionally read-only. It does not create, update, or delete issues yet.

## Files Changed

The implementation is mainly in these files:

- `backend/app/mcp_server.py`
  Contains the MCP server, MCP tools, MCP resources, prompt, database helpers, and bearer-token wrapper.

- `backend/app/main.py`
  Mounts the MCP ASGI app at `/mcp` and starts/stops the MCP session manager with FastAPI startup and shutdown.

- `backend/app/config.py`
  Adds the `mcp_api_token` setting.

- `backend/.env.example`
  Documents the optional `MCP_API_TOKEN` environment variable.

- `backend/requirements.txt`
  Adds `mcp[cli]==1.28.0` and updates FastAPI/Starlette/Uvicorn pins to versions compatible with the MCP SDK.

## Endpoint

When the backend is running, the MCP endpoint is:

```text
http://localhost:8000/mcp
```

This is mounted separately from the normal REST API routes:

```text
REST API: /api/v1
MCP:      /mcp
```

## Security

MCP is protected by an optional bearer token.

Set this in `backend/.env`:

```environment
MCP_API_TOKEN=your-long-random-token
```

When `MCP_API_TOKEN` is set, MCP clients must send:

```http
Authorization: Bearer your-long-random-token
```

If `MCP_API_TOKEN` is empty, the MCP endpoint is open. That is useful for local development, but not recommended for shared or production environments.

The token check is implemented in `BearerTokenASGIMiddleware` inside `backend/app/mcp_server.py`.

## How The Request Flow Works

1. A client connects to `http://localhost:8000/mcp`.
2. FastAPI receives the request.
3. `app.mount("/mcp", create_mcp_asgi_app())` forwards the request to the MCP ASGI app.
4. `BearerTokenASGIMiddleware` checks the bearer token if `MCP_API_TOKEN` is configured.
5. The MCP SDK routes the request to the requested tool, resource, or prompt.
6. The tool opens a SQLAlchemy session with `db_session()`.
7. The tool queries ZYRAA database models.
8. Results are converted to JSON-safe dictionaries and returned to the MCP client.

## MCP Server Setup

The MCP server is created in `backend/app/mcp_server.py`:

```python
mcp_server = FastMCP(
    "ZYRAA",
    instructions=(
        "Expose ZYRAA project-management data to MCP clients. "
        "Use read-only tools for project, issue, board, and sprint context."
    ),
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
)
```

Important settings:

- `ZYRAA`
  The server name shown to MCP clients.

- `stateless_http=True`
  Keeps the HTTP server simpler for web-app integration.

- `json_response=True`
  Returns JSON responses instead of server-sent event streaming responses.

- `streamable_http_path="/"`
  Makes the mounted MCP app respond at `/mcp`.

## FastAPI Mounting

In `backend/app/main.py`, MCP is mounted like this:

```python
app.mount("/mcp", create_mcp_asgi_app())
```

MCP also needs its session manager to run during the FastAPI app lifetime:

```python
@app.on_event("startup")
async def start_mcp_session_manager():
    global _mcp_session_manager_context
    _mcp_session_manager_context = mcp_server.session_manager.run()
    await _mcp_session_manager_context.__aenter__()
```

On shutdown, the app exits that context:

```python
@app.on_event("shutdown")
async def stop_mcp_session_manager():
    global _mcp_session_manager_context
    if _mcp_session_manager_context is not None:
        await _mcp_session_manager_context.__aexit__(None, None, None)
        _mcp_session_manager_context = None
```

## Database Pattern

MCP tools use the same SQLAlchemy database setup as the REST API.

The helper:

```python
@contextmanager
def db_session() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Every MCP tool opens a session only for the duration of that tool call.

Example:

```python
@mcp_server.tool()
def list_projects(limit: int = 50, include_archived: bool = False) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 100))
    with db_session() as db:
        query = db.query(Project).options(joinedload(Project.lead)).order_by(Project.project_key.asc())
        if not include_archived:
            query = query.filter(Project.is_archived == False)
        return [serialize_project(project) for project in query.limit(limit).all()]
```

The `limit` is clamped so clients cannot accidentally request too many records.

## JSON Serialization

Database values such as `datetime`, `date`, and `Decimal` are not directly JSON-safe. The helper `to_jsonable()` converts them:

```python
def to_jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    return value
```

The serializers call this helper before returning data to MCP clients.

## Available MCP Tools

### `list_projects`

Lists projects.

Parameters:

- `limit`: maximum number of projects, clamped between 1 and 100.
- `include_archived`: whether archived projects should be included.

Returns project keys, names, descriptions, lead user details, and timestamps.

### `get_project`

Gets one project by `project_key`.

Also returns:

- `issue_totals`: issue counts grouped by status.
- `issue_count`: total number of issues in the project.

### `search_issues`

Searches issues by text and optional filters.

Parameters:

- `query`
- `project_key`
- `status`
- `assignee_username`
- `limit`

The search checks:

- issue summary
- issue key
- issue description

### `get_issue`

Gets one issue by `issue_key`.

Includes:

- project key
- issue type
- summary and description
- priority
- status
- assignee and reporter
- component and version
- labels
- estimates and time spent
- comments
- incoming and outgoing issue links

### `list_boards`

Lists boards with columns and sprints.

Parameters:

- `project_key`
- `include_inactive`

Returns board metadata, ordered columns, and sprint summaries.

## Available MCP Resources

### `zyraa://projects`

Returns the current project list as JSON.

### `zyraa://issues/{issue_key}`

Returns one issue as JSON.

Example resource:

```text
zyraa://issues/ABC-123
```

## Available MCP Prompt

### `triage_issue`

Creates a reusable triage prompt for an issue idea.

Parameters:

- `summary`
- `description`
- `project_key`

It asks the AI client to identify:

- issue type
- priority
- likely owner
- acceptance criteria
- missing information

## How To Run

Install backend dependencies:

```powershell
cd backend
python -m pip install -r requirements.txt
```

Start the backend:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

MCP is available at:

```text
http://localhost:8000/mcp
```

## How To Add A New MCP Tool

Add a function in `backend/app/mcp_server.py` and decorate it with `@mcp_server.tool()`.

Example:

```python
@mcp_server.tool()
def count_open_issues(project_key: str) -> dict[str, Any]:
    """Count open issues for a project."""
    with db_session() as db:
        count = (
            db.query(Issue)
            .join(Project)
            .filter(Project.project_key == project_key)
            .filter(Issue.status.has(is_final_status=False))
            .count()
        )
        return {"project_key": project_key, "open_issues": count}
```

Guidelines:

- Keep tools small and specific.
- Clamp user-controlled limits.
- Return JSON-safe dictionaries or lists.
- Use `db_session()` for database access.
- Reuse existing models and services where possible.
- Avoid write operations until MCP has a per-user authorization model.

## Why Write Operations Are Not Exposed Yet

The existing REST API uses JWT authentication and project permissions. The MCP endpoint currently uses a single optional bearer token.

That means MCP can identify a client, but it does not yet map each request to a specific ZYRAA user and permission set. Because of that, write tools such as `create_issue`, `update_issue`, or `delete_issue` should wait until one of these is implemented:

- Per-user MCP authentication.
- JWT forwarding from the frontend or client.
- A dedicated service account with explicit, limited permissions.
- Tool-level approval workflows for mutations.

Until then, read-only tools are safer.

## Verification Commands

Run these after editing MCP code:

```powershell
python -m compileall backend\app
cd backend
python -c "from app.main import app; print('app import ok')"
python -c "from app.mcp_server import mcp_server, create_mcp_asgi_app; print(hasattr(mcp_server, 'session_manager')); print(type(create_mcp_asgi_app()).__name__)"
```

Expected output includes:

```text
app import ok
True
BearerTokenASGIMiddleware
```

## Common Problems

### `ModuleNotFoundError: No module named 'mcp'`

Install backend dependencies:

```powershell
cd backend
python -m pip install -r requirements.txt
```

### Dependency conflict with AnyIO

The MCP SDK requires AnyIO 4. Older FastAPI versions such as `0.104.1` require AnyIO 3. That is why `requirements.txt` now pins FastAPI to `>=0.124,<0.125`.

### Unauthorized response from `/mcp`

If `MCP_API_TOKEN` is set, include this header:

```http
Authorization: Bearer your-token
```

### Tool returns dates or decimals incorrectly

Use `to_jsonable()` before returning custom nested payloads.

## Current Limitations

- MCP is read-only.
- MCP authorization is token-based, not per-user.
- There is no frontend UI for MCP configuration yet.
- No MCP-specific tests have been added yet.

## Suggested Next Steps

Add tests around:

- token middleware behavior
- tool output shape
- not-found responses
- limit clamping

After per-user authorization is designed, add write tools for controlled actions such as creating issues and comments.
