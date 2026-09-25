"""Time tracking, project visibility, and requirements-document ingestion.

These three changes all alter what a user is allowed to see or what a write does
to stored totals, so each is exercised through the real API routes rather than
by calling the service functions directly.

Runs under pytest, or standalone with ``python tests/test_workflow_rules.py``.
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import sys
import warnings
from datetime import datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("DATABASE_SERVER", "sqlite://")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1 import api_router
from app.api.v1.dependencies import get_current_user
from app.database import Base, get_db
from app.models import (
    Issue,
    IssuePriority,
    IssueStatus,
    IssueType,
    Project,
    ProjectRole,
    Resolution,
    User,
    Worklog,
)
from app.services import document_service
from app.services.permission_service import visible_project_ids

warnings.filterwarnings("ignore", category=SAWarning)

# user_id 1 is the built-in admin (permission_service.has_admin_permissions), so
# the visibility tests act as user 2, who has no special rights.
ADMIN_ID = 1
MEMBER_ID = 2
OUTSIDER_ID = 3


def build_client(acting_user_id: int = MEMBER_ID):
    """The real routers over a throwaway database, acting as one chosen user."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    db = Session()
    db.add_all([
        IssueStatus(status_id=1, name="To Do", sort_order=1, is_final_status=False),
        IssueStatus(status_id=2, name="In Progress", sort_order=2, is_final_status=False),
        IssueStatus(status_id=3, name="Done", sort_order=3, is_final_status=True),
        IssueType(issue_type_id=1, name="Story"),
        IssueType(issue_type_id=2, name="Bug"),
        IssueType(issue_type_id=3, name="Task"),
        IssueType(issue_type_id=4, name="Epic"),
        IssuePriority(priority_id=1, name="Highest", sort_order=1),
        IssuePriority(priority_id=2, name="Medium", sort_order=3),
        Resolution(resolution_id=1, name="Done"),
    ])
    db.add_all([
        User(user_id=ADMIN_ID, username="root", email="root@example.com", password_hash="x", display_name="Root"),
        User(user_id=MEMBER_ID, username="mira", email="mira@example.com", password_hash="x", display_name="Mira"),
        User(user_id=OUTSIDER_ID, username="dev", email="dev@example.com", password_hash="x", display_name="Dev"),
    ])
    # ALPHA: mira leads it. BETA: mira has one assigned issue. GAMMA: nothing to do with mira.
    db.add_all([
        Project(project_id=1, project_key="ALPHA", name="Alpha Platform", lead_user_id=MEMBER_ID),
        Project(project_id=2, project_key="BETA", name="Beta Portal", lead_user_id=ADMIN_ID),
        Project(project_id=3, project_key="GAMMA", name="Gamma Internal", lead_user_id=ADMIN_ID),
    ])
    db.commit()
    db.close()

    def override_get_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    def override_current_user():
        session = Session()
        try:
            return session.query(User).filter(User.user_id == acting_user_id).first()
        finally:
            session.close()

    app = FastAPI()
    app.include_router(api_router)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user
    return TestClient(app), Session


def seed_issue(Session, *, project_id: int, issue_key: str, assignee_id: int | None = None,
               reporter_id: int = ADMIN_ID, estimate: float | None = None) -> int:
    db = Session()
    try:
        issue = Issue(
            issue_key=issue_key,
            project_id=project_id,
            issue_type_id=1,
            summary=f"Work item {issue_key}",
            status_id=1,
            priority_id=2,
            reporter_user_id=reporter_id,
            assignee_user_id=assignee_id,
            original_estimate=estimate,
            remaining_estimate=estimate,
        )
        db.add(issue)
        db.commit()
        return issue.issue_id
    finally:
        db.close()


def read_issue(Session, issue_id: int):
    db = Session()
    try:
        issue = db.query(Issue).filter(Issue.issue_id == issue_id).first()
        return {
            "time_spent": float(issue.time_spent or 0),
            "original": float(issue.original_estimate) if issue.original_estimate is not None else None,
            "remaining": float(issue.remaining_estimate) if issue.remaining_estimate is not None else None,
        }
    finally:
        db.close()


def log_work(client, issue_id: int, hours: float, **extra):
    body = {
        "time_spent": hours,
        "started_at": datetime.utcnow().isoformat(),
        **extra,
    }
    return client.post(f"/api/v1/issues/{issue_id}/worklogs", json=body)


# ---------------------------------------------------------------------------
# Time tracking
# ---------------------------------------------------------------------------


def test_logging_work_updates_the_issue_totals():
    client, Session = build_client(ADMIN_ID)
    issue_id = seed_issue(Session, project_id=1, issue_key="ALPHA-1", estimate=8)

    assert log_work(client, issue_id, 3).status_code == 201

    totals = read_issue(Session, issue_id)
    assert totals["time_spent"] == 3.0
    assert totals["remaining"] == 5.0  # Burned down automatically.
    assert totals["original"] == 8.0  # The original estimate never moves.


def test_logging_more_than_estimated_floors_remaining_at_zero():
    client, Session = build_client(ADMIN_ID)
    issue_id = seed_issue(Session, project_id=1, issue_key="ALPHA-2", estimate=4)

    log_work(client, issue_id, 6)

    totals = read_issue(Session, issue_id)
    # The overrun is visible in time spent rather than as a negative remainder.
    assert totals["time_spent"] == 6.0
    assert totals["remaining"] == 0.0
    assert totals["original"] == 4.0


def test_remaining_estimate_adjustment_modes():
    client, Session = build_client(ADMIN_ID)

    leave_id = seed_issue(Session, project_id=1, issue_key="ALPHA-3", estimate=10)
    log_work(client, leave_id, 3, remaining_adjustment="leave")
    assert read_issue(Session, leave_id)["remaining"] == 10.0

    set_id = seed_issue(Session, project_id=1, issue_key="ALPHA-4", estimate=10)
    log_work(client, set_id, 3, remaining_adjustment="set", remaining_value=12)
    assert read_issue(Session, set_id)["remaining"] == 12.0

    reduce_id = seed_issue(Session, project_id=1, issue_key="ALPHA-5", estimate=10)
    log_work(client, reduce_id, 3, remaining_adjustment="reduce", remaining_value=1)
    assert read_issue(Session, reduce_id)["remaining"] == 9.0

    # Every mode still records the hours actually spent.
    for issue_id in (leave_id, set_id, reduce_id):
        assert read_issue(Session, issue_id)["time_spent"] == 3.0


def test_logging_accumulates_across_entries():
    client, Session = build_client(ADMIN_ID)
    issue_id = seed_issue(Session, project_id=1, issue_key="ALPHA-6", estimate=10)

    log_work(client, issue_id, 2)
    log_work(client, issue_id, 2.5)

    totals = read_issue(Session, issue_id)
    assert totals["time_spent"] == 4.5
    assert totals["remaining"] == 5.5


def test_deleting_a_worklog_returns_the_hours():
    client, Session = build_client(ADMIN_ID)
    issue_id = seed_issue(Session, project_id=1, issue_key="ALPHA-7", estimate=8)
    worklog_id = log_work(client, issue_id, 3).json()["worklog_id"]

    assert client.delete(f"/api/v1/issues/{issue_id}/worklogs/{worklog_id}").status_code == 204

    totals = read_issue(Session, issue_id)
    assert totals["time_spent"] == 0.0
    assert totals["remaining"] == 8.0


def test_logging_against_an_issue_without_an_estimate():
    client, Session = build_client(ADMIN_ID)
    issue_id = seed_issue(Session, project_id=1, issue_key="ALPHA-8")

    log_work(client, issue_id, 2)

    totals = read_issue(Session, issue_id)
    assert totals["time_spent"] == 2.0
    assert totals["remaining"] is None  # Nothing to burn down against.


# ---------------------------------------------------------------------------
# Project visibility
# ---------------------------------------------------------------------------


def test_project_list_shows_only_the_users_own_projects():
    client, Session = build_client(MEMBER_ID)
    seed_issue(Session, project_id=2, issue_key="BETA-1", assignee_id=MEMBER_ID)
    seed_issue(Session, project_id=3, issue_key="GAMMA-1", assignee_id=OUTSIDER_ID)

    keys = [row["project_key"] for row in client.get("/api/v1/projects/").json()]

    assert "ALPHA" in keys  # Mira leads it.
    assert "BETA" in keys  # Mira has an assigned issue in it.
    assert "GAMMA" not in keys  # No relationship at all.


def test_reported_issues_also_grant_visibility():
    client, Session = build_client(MEMBER_ID)
    seed_issue(Session, project_id=3, issue_key="GAMMA-2", reporter_id=MEMBER_ID)

    keys = [row["project_key"] for row in client.get("/api/v1/projects/").json()]
    assert "GAMMA" in keys


def test_project_role_grants_visibility_without_any_issues():
    client, Session = build_client(MEMBER_ID)
    db = Session()
    db.add(ProjectRole(user_id=MEMBER_ID, project_id=3, role_type="developer"))
    db.commit()
    db.close()

    keys = [row["project_key"] for row in client.get("/api/v1/projects/").json()]
    assert "GAMMA" in keys


def test_admin_still_sees_every_project():
    client, _ = build_client(ADMIN_ID)
    keys = [row["project_key"] for row in client.get("/api/v1/projects/").json()]
    assert {"ALPHA", "BETA", "GAMMA"} <= set(keys)


def test_search_finds_projects_the_user_is_not_in():
    client, _ = build_client(MEMBER_ID)

    results = {row["project_key"]: row for row in client.get("/api/v1/projects/search", params={"q": "gamma"}).json()}

    assert "GAMMA" in results  # Searching is what surfaces it.
    assert results["GAMMA"]["is_member"] is False
    assert results["GAMMA"]["description"] is None  # Identity only, not contents.


def test_search_marks_the_users_own_projects_as_member():
    client, _ = build_client(MEMBER_ID)
    results = {row["project_key"]: row for row in client.get("/api/v1/projects/search", params={"q": "alpha"}).json()}
    assert results["ALPHA"]["is_member"] is True


def test_non_member_cannot_open_a_project_or_its_issues():
    client, Session = build_client(MEMBER_ID)
    seed_issue(Session, project_id=3, issue_key="GAMMA-3", assignee_id=OUTSIDER_ID)

    assert client.get("/api/v1/projects/3").status_code == 403
    assert client.get("/api/v1/projects/3/issues").status_code == 403
    assert client.get("/api/v1/projects/3/stats").status_code == 403


def test_member_can_open_their_own_project():
    client, Session = build_client(MEMBER_ID)
    seed_issue(Session, project_id=2, issue_key="BETA-2", assignee_id=MEMBER_ID)

    assert client.get("/api/v1/projects/1").status_code == 200  # Leads it.
    assert client.get("/api/v1/projects/2").status_code == 200  # Assigned an issue in it.


def test_visible_project_ids_matches_the_listing():
    client, Session = build_client(MEMBER_ID)
    seed_issue(Session, project_id=2, issue_key="BETA-3", assignee_id=MEMBER_ID)

    db = Session()
    try:
        mira = db.query(User).filter(User.user_id == MEMBER_ID).first()
        assert visible_project_ids(db, mira) == {1, 2}
    finally:
        db.close()


def test_assignee_can_update_and_log_against_their_own_issue():
    """Visibility through assignment is only useful if the assignee can act."""
    client, Session = build_client(MEMBER_ID)
    # Mira is assigned an issue in BETA, where she holds no role and is not lead.
    issue_id = seed_issue(Session, project_id=2, issue_key="BETA-9", assignee_id=MEMBER_ID, estimate=6)

    assert client.put(f"/api/v1/issues/{issue_id}", json={"status": "In Progress"}).status_code == 200
    assert log_work(client, issue_id, 2).status_code == 201

    totals = read_issue(Session, issue_id)
    assert totals["time_spent"] == 2.0
    assert totals["remaining"] == 4.0


def test_reporter_can_update_their_own_issue():
    client, Session = build_client(MEMBER_ID)
    issue_id = seed_issue(Session, project_id=2, issue_key="BETA-10", reporter_id=MEMBER_ID)
    assert client.put(f"/api/v1/issues/{issue_id}", json={"priority": "Highest"}).status_code == 200


def test_a_stranger_still_cannot_touch_someone_elses_issue():
    client, Session = build_client(MEMBER_ID)
    # GAMMA-9 belongs to another user entirely; mira has no relationship with it.
    issue_id = seed_issue(Session, project_id=3, issue_key="GAMMA-9", assignee_id=OUTSIDER_ID, reporter_id=OUTSIDER_ID)

    assert client.put(f"/api/v1/issues/{issue_id}", json={"status": "Done"}).status_code == 403
    assert log_work(client, issue_id, 1).status_code == 403


def test_owning_an_issue_does_not_grant_deletion():
    client, Session = build_client(MEMBER_ID)
    issue_id = seed_issue(Session, project_id=2, issue_key="BETA-11", assignee_id=MEMBER_ID)
    # Removing work stays a project-level decision.
    assert client.delete(f"/api/v1/issues/{issue_id}").status_code == 403


# ---------------------------------------------------------------------------
# Requirements documents
# ---------------------------------------------------------------------------


def test_extracts_text_from_plain_formats():
    assert "Build a portal" in document_service.extract_text("spec.txt", b"Build a portal")
    assert "Build a portal" in document_service.extract_text("spec.md", b"# Build a portal")

    payload = json.dumps({"epic": "Checkout", "stories": ["Cart", "Payment"]}).encode()
    extracted = document_service.extract_text("spec.json", payload)
    assert "Checkout" in extracted and "Payment" in extracted

    yaml_text = document_service.extract_text("spec.yaml", b"epic: Checkout\nstories:\n  - Cart\n  - Payment\n")
    assert "Checkout" in yaml_text and "Cart" in yaml_text


def test_extracts_text_from_docx_including_headings():
    import docx

    document = docx.Document()
    document.add_heading("Customer Portal", level=1)
    document.add_paragraph("Self-service for support customers.")
    document.add_heading("Authentication", level=2)
    document.add_paragraph("Users sign in with SSO.")
    buffer = io.BytesIO()
    document.save(buffer)

    text = document_service.extract_text("spec.docx", buffer.getvalue())

    assert "# Customer Portal" in text
    assert "## Authentication" in text
    assert "Users sign in with SSO." in text


def test_rejects_unsupported_and_broken_files():
    for filename, payload, expected in [
        ("spec.exe", b"binary", "Unsupported file type"),
        ("spec.txt", b"", "empty"),
        ("spec.json", b"{not json", "not valid"),
        ("spec.pdf", b"not really a pdf", "could not be opened"),
    ]:
        try:
            document_service.extract_text(filename, payload)
        except document_service.DocumentError as exc:
            assert expected.lower() in str(exc).lower(), f"{filename}: {exc}"
        else:
            raise AssertionError(f"{filename} should have been rejected")


def test_oversized_files_are_rejected():
    too_big = b"x" * (document_service.MAX_BYTES + 1)
    try:
        document_service.extract_text("spec.txt", too_big)
    except document_service.DocumentError as exc:
        assert "larger than" in str(exc)
    else:
        raise AssertionError("An oversized file should have been rejected")


def test_heading_fallback_builds_epics_and_stories():
    text = """# Checkout
Customers must be able to pay.
- Add a cart summary
- Support saved cards

# Reporting
## Export orders to CSV
"""
    plan = document_service.normalize_plan(document_service._plan_from_headings(text))

    summaries = [epic["summary"] for epic in plan["epics"]]
    assert summaries == ["Checkout", "Reporting"]

    checkout = plan["epics"][0]
    assert [story["summary"] for story in checkout["stories"]] == ["Add a cart summary", "Support saved cards"]
    assert plan["story_count"] == 3  # Two under Checkout, one under Reporting.


def test_plan_normalisation_clamps_untrusted_values():
    plan = document_service.normalize_plan({
        "project_summary": "x" * 5000,
        "epics": [
            {
                "summary": "Valid epic",
                "stories": [
                    {"summary": "Fix the crash", "issue_type": "BUG", "priority": "CRITICAL", "estimate_hours": "6"},
                    {"summary": "", "description": "dropped: no summary"},
                    {"summary": "Odd types", "issue_type": "Saga", "estimate_hours": -3},
                ],
            },
            {"summary": "", "stories": []},  # Dropped: no summary.
            "not a dict",
        ],
    })

    assert len(plan["epics"]) == 1
    stories = plan["epics"][0]["stories"]
    assert len(stories) == 2  # The summary-less story is dropped.
    assert stories[0]["issue_type"] == "Bug"
    assert stories[0]["priority"] == "Medium"  # "CRITICAL" is not a real priority.
    assert stories[0]["estimate_hours"] == 6.0
    assert stories[1]["issue_type"] == "Story"  # "Saga" falls back.
    assert stories[1]["estimate_hours"] is None  # Negative estimate dropped.
    assert len(plan["project_summary"]) <= 2000


def test_model_json_is_parsed_even_inside_a_code_fence():
    fenced = '```json\n{"project_summary": "s", "epics": [{"summary": "E", "stories": []}]}\n```'
    assert document_service._parse_plan(fenced)["epics"][0]["summary"] == "E"

    prose = 'Here is the plan:\n{"epics": [{"summary": "E2", "stories": []}]}\nHope that helps.'
    assert document_service._parse_plan(prose)["epics"][0]["summary"] == "E2"

    assert document_service._parse_plan("sorry, I cannot help") is None
    assert document_service._parse_plan('{"epics": []}') is None  # Empty plan is not usable.


def test_document_plan_endpoint_returns_a_reviewable_plan():
    client, _ = build_client(ADMIN_ID)
    spec = b"# Checkout\n- Add a cart summary\n- Support saved cards\n"

    response = client.post(
        "/api/v1/agents/documents/plan",
        files={"file": ("spec.md", spec, "text/markdown")},
    )

    assert response.status_code == 200, response.text
    plan = response.json()
    assert plan["filename"] == "spec.md"
    assert plan["epics"], plan
    assert plan["story_count"] >= 1
    # Nothing was written yet: the plan is a proposal.
    assert "created" not in plan


def test_document_plan_endpoint_rejects_a_bad_file():
    client, _ = build_client(ADMIN_ID)
    response = client.post(
        "/api/v1/agents/documents/plan",
        files={"file": ("spec.exe", b"binary", "application/octet-stream")},
    )
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_applying_a_plan_creates_epics_with_linked_stories():
    client, Session = build_client(ADMIN_ID)

    response = client.post("/api/v1/agents/documents/apply", json={
        "project_key": "ALPHA",
        "assignee_username": "mira",
        "epics": [
            {
                "summary": "Checkout",
                "description": "Customers must be able to pay.",
                "stories": [
                    {"summary": "Add a cart summary", "issue_type": "Story", "priority": "Highest", "estimate_hours": 5},
                    {"summary": "Fix card decline bug", "issue_type": "Bug"},
                ],
            }
        ],
    })

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["epic_count"] == 1
    assert body["story_count"] == 2

    epic_key = body["created"][0]["epic"]["issue_key"]
    story_id = body["created"][0]["stories"][0]["issue_id"]

    # The story reports the epic it belongs to, which is what the board reads.
    detail = client.get(f"/api/v1/issues/{story_id}").json()
    assert detail["epic_issue_key"] == epic_key
    assert detail["assignee_username"] == "mira"
    assert detail["original_estimate"] == 5.0
    assert detail["issue_type"] == "Story"

    bug_id = body["created"][0]["stories"][1]["issue_id"]
    assert client.get(f"/api/v1/issues/{bug_id}").json()["issue_type"] == "Bug"


def test_applying_a_plan_to_an_unknown_project_is_rejected():
    client, _ = build_client(ADMIN_ID)
    response = client.post("/api/v1/agents/documents/apply", json={
        "project_key": "NOPE",
        "epics": [{"summary": "E", "stories": []}],
    })
    assert response.status_code == 404


def main() -> int:
    tests = [(name, fn) for name, fn in sorted(globals().items()) if name.startswith("test_") and callable(fn)]
    failures = []
    for name, fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 - standalone reporter
            failures.append((name, exc))
            print(f"FAIL  {name}: {type(exc).__name__}: {exc}")
        else:
            print(f"ok    {name}")
    print(f"\n{len(tests) - len(failures)}/{len(tests)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
