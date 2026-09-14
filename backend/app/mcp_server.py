import json
import secrets
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from starlette.responses import JSONResponse

from app.config import settings
from app.database import SessionLocal
from app.models import Board, Issue, IssueLink, IssueStatus, Project


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


class BearerTokenASGIMiddleware:
    """Protect the mounted MCP app when MCP_API_TOKEN is configured."""

    def __init__(self, app: Any, token: Optional[str]) -> None:
        self.app = app
        self.token = token

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if self.token and scope["type"] == "http" and scope.get("method") != "OPTIONS":
            headers = dict(scope.get("headers", []))
            authorization = headers.get(b"authorization", b"").decode("utf-8")
            expected = f"Bearer {self.token}"
            if not secrets.compare_digest(authorization, expected):
                response = JSONResponse({"detail": "Unauthorized"}, status_code=401)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


def create_mcp_asgi_app() -> Any:
    return BearerTokenASGIMiddleware(
        mcp_server.streamable_http_app(),
        settings.mcp_api_token,
    )


@contextmanager
def db_session() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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


def serialize_project(project: Project) -> dict[str, Any]:
    return to_jsonable(
        {
            "project_id": project.project_id,
            "project_key": project.project_key,
            "name": project.name,
            "description": project.description,
            "project_type": project.project_type,
            "is_archived": project.is_archived,
            "lead_username": project.lead.username if project.lead else None,
            "lead_display_name": project.lead.display_name if project.lead else None,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }
    )


def serialize_issue(issue: Issue, include_details: bool = False) -> dict[str, Any]:
    payload = {
        "issue_id": issue.issue_id,
        "issue_key": issue.issue_key,
        "project_key": issue.project.project_key if issue.project else "",
        "issue_type": issue.issue_type.name if issue.issue_type else "",
        "summary": issue.summary,
        "description": issue.description,
        "priority": issue.priority.name if issue.priority else None,
        "status": issue.status.name if issue.status else "",
        "resolution": issue.resolution.name if issue.resolution else None,
        "assignee_username": issue.assignee.username if issue.assignee else None,
        "assignee_display_name": issue.assignee.display_name if issue.assignee else None,
        "reporter_username": issue.reporter.username if issue.reporter else "",
        "component_name": issue.component.name if issue.component else None,
        "version_name": issue.version.name if issue.version else None,
        "labels": [label.name for label in issue.labels],
        "original_estimate": issue.original_estimate,
        "remaining_estimate": issue.remaining_estimate,
        "time_spent": issue.time_spent,
        "due_date": issue.due_date,
        "created_at": issue.created_at,
        "updated_at": issue.updated_at,
    }
    if include_details:
        payload["comments"] = [
            {
                "comment_id": comment.comment_id,
                "body": comment.body,
                "username": comment.author.username if comment.author else "",
                "created_at": comment.created_at,
            }
            for comment in sorted(issue.comments, key=lambda item: item.created_at or datetime.min)
        ]
        payload["links"] = [
            {
                "link_type": link.link_type,
                "direction": "outgoing",
                "issue_key": link.issue_to.issue_key if link.issue_to else None,
                "summary": link.issue_to.summary if link.issue_to else None,
            }
            for link in issue.outgoing_links
        ] + [
            {
                "link_type": link.link_type,
                "direction": "incoming",
                "issue_key": link.issue_from.issue_key if link.issue_from else None,
                "summary": link.issue_from.summary if link.issue_from else None,
            }
            for link in issue.incoming_links
        ]
    return to_jsonable(payload)


def load_issue_query(db: Session):
    return db.query(Issue).options(
        joinedload(Issue.project),
        joinedload(Issue.issue_type),
        joinedload(Issue.priority),
        joinedload(Issue.status),
        joinedload(Issue.resolution),
        joinedload(Issue.assignee),
        joinedload(Issue.reporter),
        joinedload(Issue.component),
        joinedload(Issue.version),
        joinedload(Issue.labels),
        joinedload(Issue.comments),
        joinedload(Issue.outgoing_links).joinedload(IssueLink.issue_to),
        joinedload(Issue.incoming_links).joinedload(IssueLink.issue_from),
    )


@mcp_server.tool()
def list_projects(limit: int = 50, include_archived: bool = False) -> list[dict[str, Any]]:
    """List ZYRAA projects."""
    limit = max(1, min(limit, 100))
    with db_session() as db:
        query = db.query(Project).options(joinedload(Project.lead)).order_by(Project.project_key.asc())
        if not include_archived:
            query = query.filter(Project.is_archived == False)
        return [serialize_project(project) for project in query.limit(limit).all()]


@mcp_server.tool()
def get_project(project_key: str) -> dict[str, Any]:
    """Get a project by project key with issue totals by status."""
    with db_session() as db:
        project = (
            db.query(Project)
            .options(joinedload(Project.lead))
            .filter(Project.project_key == project_key)
            .first()
        )
        if project is None:
            return {"error": f"Project '{project_key}' was not found"}

        status_rows = (
            db.query(IssueStatus.name, func.count(Issue.issue_id))
            .join(IssueStatus, Issue.status_id == IssueStatus.status_id)
            .filter(Issue.project_id == project.project_id)
            .group_by(IssueStatus.name)
            .all()
        )
        issue_totals = {status_name: count for status_name, count in status_rows}
        payload = serialize_project(project)
        payload["issue_totals"] = issue_totals
        payload["issue_count"] = sum(issue_totals.values())
        return payload


@mcp_server.tool()
def search_issues(
    query: str = "",
    project_key: Optional[str] = None,
    status: Optional[str] = None,
    assignee_username: Optional[str] = None,
    limit: int = 25,
) -> list[dict[str, Any]]:
    """Search issues by text and optional project, status, or assignee filters."""
    limit = max(1, min(limit, 100))
    with db_session() as db:
        issues = load_issue_query(db)
        if query:
            like = f"%{query}%"
            issues = issues.filter(
                (Issue.summary.ilike(like))
                | (Issue.issue_key.ilike(like))
                | (Issue.description.ilike(like))
            )
        if project_key:
            issues = issues.join(Project).filter(Project.project_key == project_key)
        if status:
            issues = issues.filter(Issue.status.has(name=status))
        if assignee_username:
            issues = issues.filter(Issue.assignee.has(username=assignee_username))
        return [
            serialize_issue(issue)
            for issue in issues.order_by(Issue.updated_at.desc(), Issue.issue_id.desc()).limit(limit).all()
        ]


@mcp_server.tool()
def get_issue(issue_key: str) -> dict[str, Any]:
    """Get one issue by key, including comments and links."""
    with db_session() as db:
        issue = load_issue_query(db).filter(Issue.issue_key == issue_key).first()
        if issue is None:
            return {"error": f"Issue '{issue_key}' was not found"}
        return serialize_issue(issue, include_details=True)


@mcp_server.tool()
def list_boards(project_key: Optional[str] = None, include_inactive: bool = False) -> list[dict[str, Any]]:
    """List boards, columns, and sprints for an optional project key."""
    with db_session() as db:
        boards = db.query(Board).options(
            joinedload(Board.project),
            joinedload(Board.columns),
            joinedload(Board.sprints),
        )
        if project_key:
            boards = boards.join(Project).filter(Project.project_key == project_key)
        if not include_inactive:
            boards = boards.filter(Board.is_active == True)

        payload = []
        for board in boards.order_by(Board.board_id.asc()).all():
            payload.append(
                to_jsonable(
                    {
                        "board_id": board.board_id,
                        "project_key": board.project.project_key if board.project else "",
                        "name": board.name,
                        "description": board.description,
                        "board_type": board.board_type,
                        "is_active": board.is_active,
                        "columns": [
                            {
                                "column_id": column.column_id,
                                "name": column.name,
                                "status_name": column.status_name,
                                "sort_order": column.sort_order,
                            }
                            for column in sorted(board.columns, key=lambda item: item.sort_order)
                        ],
                        "sprints": [
                            {
                                "sprint_id": sprint.sprint_id,
                                "name": sprint.name,
                                "goal": sprint.goal,
                                "status": sprint.sprint_status,
                                "start_date": sprint.start_date,
                                "end_date": sprint.end_date,
                                "is_completed": sprint.is_completed,
                            }
                            for sprint in sorted(board.sprints, key=lambda item: item.start_date)
                        ],
                    }
                )
            )
        return payload


@mcp_server.resource("zyraa://projects")
def projects_resource() -> str:
    """Read the current project list as JSON."""
    return json.dumps(list_projects(), indent=2)


@mcp_server.resource("zyraa://issues/{issue_key}")
def issue_resource(issue_key: str) -> str:
    """Read one issue as JSON by issue key."""
    return json.dumps(get_issue(issue_key), indent=2)


@mcp_server.prompt()
def triage_issue(summary: str, description: str = "", project_key: str = "") -> str:
    """Create a prompt for triaging a possible ZYRAA issue."""
    project_line = f"Project key: {project_key}\n" if project_key else ""
    return (
        "Triage this ZYRAA work item. Identify issue type, priority, likely owner, "
        "acceptance criteria, and missing information.\n\n"
        f"{project_line}"
        f"Summary: {summary}\n"
        f"Description: {description or '(none provided)'}"
    )
