"""End-to-end check that moving an issue records the transition analytics needs.

Cycle time, cumulative flow, and burndown are only truthful if every status
change lands in ``issue_history``. These tests drive the real API routes against
an isolated SQLite database and assert the rows appear, then confirm the
analytics service reads them back as observed rather than estimated.

Runs under pytest, or standalone with
``python tests/test_issue_history_recording.py``.
"""

from __future__ import annotations

import os
import sys
import warnings
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
    IssueHistory,
    IssuePriority,
    IssueStatus,
    IssueType,
    Project,
    Resolution,
    User,
)
from app.services import analytics_service as svc

warnings.filterwarnings("ignore", category=SAWarning)


def build_client():
    """The real routers over a throwaway database, with auth pinned to one user.

    The app's own startup hook is SQL Server specific, so the router is mounted
    on a bare FastAPI instance instead of importing ``app.main``.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    session = Session()
    session.add_all([
        IssueStatus(status_id=1, name="To Do", color_hex="#6BA4FF", sort_order=1, is_final_status=False),
        IssueStatus(status_id=2, name="In Progress", color_hex="#F39C12", sort_order=2, is_final_status=False),
        IssueStatus(status_id=3, name="In Review", color_hex="#9B59B6", sort_order=3, is_final_status=False),
        IssueStatus(status_id=4, name="Done", color_hex="#28B463", sort_order=4, is_final_status=True),
        IssueType(issue_type_id=1, name="Story"),
        IssueType(issue_type_id=2, name="Bug"),
        IssueType(issue_type_id=3, name="Epic"),
        IssuePriority(priority_id=1, name="High", sort_order=1),
        IssuePriority(priority_id=2, name="Low", sort_order=2),
        Resolution(resolution_id=1, name="Done"),
    ])
    # Admin rights come from being user 1 (see permission_service.has_admin_permissions).
    owner = User(user_id=1, username="ada", email="ada@example.com", password_hash="x", display_name="Ada")
    session.add(owner)
    session.add(Project(project_id=1, project_key="ZY", name="Zyraa", lead_user_id=1))
    session.commit()
    session.close()

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    def override_current_user():
        db = Session()
        try:
            return db.query(User).filter(User.user_id == 1).first()
        finally:
            db.close()

    app = FastAPI()
    app.include_router(api_router)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user
    return TestClient(app), Session


def create_issue(client, summary="Ship the thing", issue_type="Story"):
    response = client.post(
        "/api/v1/issues/",
        json={"project_key": "ZY", "issue_type": issue_type, "summary": summary, "priority": "High"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def history_for(Session, issue_id: int, field: str = "status"):
    db = Session()
    try:
        return (
            db.query(IssueHistory)
            .filter(IssueHistory.issue_id == issue_id, IssueHistory.field_name == field)
            .order_by(IssueHistory.changed_at, IssueHistory.history_id)
            .all()
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------


def test_status_change_records_a_transition():
    client, Session = build_client()
    issue = create_issue(client)

    response = client.put(f"/api/v1/issues/{issue['issue_id']}", json={"status": "In Progress"})
    assert response.status_code == 200, response.text

    rows = history_for(Session, issue["issue_id"])
    assert len(rows) == 1
    assert rows[0].old_value == "To Do"
    assert rows[0].new_value == "In Progress"
    assert rows[0].user_id == 1


def test_full_workflow_records_every_hop():
    client, Session = build_client()
    issue = create_issue(client)

    for status_name in ["In Progress", "In Review", "Done"]:
        response = client.put(f"/api/v1/issues/{issue['issue_id']}", json={"status": status_name})
        assert response.status_code == 200, response.text

    rows = history_for(Session, issue["issue_id"])
    assert [(row.old_value, row.new_value) for row in rows] == [
        ("To Do", "In Progress"),
        ("In Progress", "In Review"),
        ("In Review", "Done"),
    ]


def test_unchanged_status_records_nothing():
    client, Session = build_client()
    issue = create_issue(client)

    # A summary edit is not a transition.
    response = client.put(f"/api/v1/issues/{issue['issue_id']}", json={"summary": "Renamed"})
    assert response.status_code == 200, response.text
    assert history_for(Session, issue["issue_id"]) == []

    # Nor is setting the status to the value it already has.
    client.put(f"/api/v1/issues/{issue['issue_id']}", json={"status": "To Do"})
    assert history_for(Session, issue["issue_id"]) == []


def test_assignee_and_priority_changes_are_recorded():
    client, Session = build_client()
    issue = create_issue(client)

    response = client.put(
        f"/api/v1/issues/{issue['issue_id']}",
        json={"assignee_username": "ada", "priority": "Low"},
    )
    assert response.status_code == 200, response.text

    assignee_rows = history_for(Session, issue["issue_id"], field="assignee")
    priority_rows = history_for(Session, issue["issue_id"], field="priority")
    assert [(row.old_value, row.new_value) for row in assignee_rows] == [(None, "ada")]
    assert [(row.old_value, row.new_value) for row in priority_rows] == [("High", "Low")]
    # The status never moved, so no status row was written.
    assert history_for(Session, issue["issue_id"]) == []


def test_bulk_status_update_records_each_issue():
    client, Session = build_client()
    first = create_issue(client, summary="First")
    second = create_issue(client, summary="Second")

    response = client.post(
        "/api/v1/bulk/issues/status",
        json={"issue_ids": [first["issue_id"], second["issue_id"]], "status": "In Progress"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["updated_count"] == 2

    for issue in (first, second):
        rows = history_for(Session, issue["issue_id"])
        assert [(row.old_value, row.new_value) for row in rows] == [("To Do", "In Progress")]


def test_recorded_transitions_make_analytics_observed():
    """The point of all this: analytics should stop guessing once history exists."""
    client, Session = build_client()
    issue = create_issue(client)
    client.put(f"/api/v1/issues/{issue['issue_id']}", json={"status": "In Progress"})
    client.put(f"/api/v1/issues/{issue['issue_id']}", json={"status": "Done"})

    db = Session()
    try:
        catalog = svc.status_catalog(db)
        issues = db.query(Issue).all()
        timelines = svc.build_timelines(db, issues, catalog)
        timeline = timelines[issue["issue_id"]]

        assert timeline.estimated is False
        assert svc.coverage(timelines)["observed_ratio"] == 1.0
        assert timeline.first_entry_into({svc.IN_PROGRESS}, catalog) is not None
        assert timeline.first_entry_into({svc.DONE}, catalog) is not None

        overview = svc.project_overview(db, 1, days=30)
        assert overview["totals"]["done"] == 1
        assert overview["resolved"]["current"] == 1
        assert overview["coverage"]["estimated"] == 0
        # The issue moved through both hops in the same test run, so cycle time
        # is real but tiny; what matters is that it was measured at all.
        assert overview["median_cycle_time_days"] is not None
    finally:
        db.close()


def test_analytics_routes_answer_over_http():
    client, _ = build_client()
    issue = create_issue(client)
    client.put(f"/api/v1/issues/{issue['issue_id']}", json={"status": "In Progress"})

    for path in [
        "/api/v1/analytics/projects/1/overview",
        "/api/v1/analytics/projects/1/cumulative-flow?days=14",
        "/api/v1/analytics/projects/1/control-chart",
        "/api/v1/analytics/projects/1/created-vs-resolved?days=14",
        "/api/v1/analytics/projects/1/throughput",
        "/api/v1/analytics/projects/1/aging-wip",
        "/api/v1/analytics/projects/1/workload",
        "/api/v1/analytics/projects/1/epic-progress",
    ]:
        response = client.get(path)
        assert response.status_code == 200, f"{path} -> {response.status_code} {response.text[:200]}"
        assert isinstance(response.json(), dict)

    # The in-progress issue should now show up as aging work.
    aging = client.get("/api/v1/analytics/projects/1/aging-wip").json()
    assert aging["count"] == 1
    assert aging["items"][0]["issue_key"].startswith("ZY-")


def test_missing_scope_returns_not_found():
    client, _ = build_client()
    assert client.get("/api/v1/analytics/boards/999/velocity").status_code == 404
    assert client.get("/api/v1/analytics/sprints/999/burndown").status_code == 404


def main() -> int:
    tests = [(name, fn) for name, fn in sorted(globals().items()) if name.startswith("test_") and callable(fn)]
    failures = []
    for name, fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 - this is the standalone reporter
            failures.append((name, exc))
            print(f"FAIL  {name}: {type(exc).__name__}: {exc}")
        else:
            print(f"ok    {name}")
    print(f"\n{len(tests) - len(failures)}/{len(tests)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
