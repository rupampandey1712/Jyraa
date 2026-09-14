"""Checks that the delivery metrics compute the numbers they claim to.

Runs under pytest, or standalone with ``python tests/test_analytics_service.py``
so it works before pytest is installed. The fixtures build a small project in an
in-memory SQLite database with explicit status transitions, so every expected
value below can be worked out by hand from the seed data.
"""

from __future__ import annotations

import os
import sys
import types
import warnings
from datetime import date, datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# The app package builds its engine from DATABASE_SERVER at import time.
os.environ.setdefault("DATABASE_SERVER", "sqlite://")


def _stub_mcp() -> None:
    """Stand in for the optional mcp dependency so app.main can be imported."""
    if "mcp.server.fastmcp" in sys.modules:
        return
    mcp = types.ModuleType("mcp")
    server = types.ModuleType("mcp.server")
    fastmcp = types.ModuleType("mcp.server.fastmcp")

    class FastMCP:
        def __init__(self, *args, **kwargs):
            self.session_manager = None

        def _decorator(self, *args, **kwargs):
            return lambda fn: fn

        tool = resource = prompt = _decorator

        def streamable_http_app(self):
            return None

    fastmcp.FastMCP = FastMCP
    server.fastmcp = fastmcp
    mcp.server = server
    sys.modules.setdefault("mcp", mcp)
    sys.modules.setdefault("mcp.server", server)
    sys.modules.setdefault("mcp.server.fastmcp", fastmcp)


try:  # pragma: no cover - only needed when the optional dependency is absent
    import mcp.server.fastmcp  # noqa: F401
except ImportError:  # pragma: no cover
    _stub_mcp()

from sqlalchemy import create_engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Board,
    Issue,
    IssueHistory,
    IssueLink,
    IssuePriority,
    IssueStatus,
    IssueType,
    Project,
    Sprint,
    User,
)
from app.services import analytics_service as svc

# Metrics that look back over a rolling window compare against the real clock, so
# their fixtures are anchored to now. Sprint tests use fixed dates instead, since
# burndown is bounded by the sprint's own start and end.
NOW = datetime.utcnow()

# The ORM emits overlap warnings for pre-existing relationships (User.skills,
# Issue.requirements, Issue.pull_requests) that are unrelated to these metrics.
warnings.filterwarnings("ignore", category=SAWarning)


def build_session():
    """An in-memory database seeded with reference data, a project, and a board."""
    engine = create_engine("sqlite://", future=True)
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

    session.add_all([
        IssueStatus(status_id=1, name="To Do", color_hex="#6BA4FF", sort_order=1, is_final_status=False),
        IssueStatus(status_id=2, name="In Progress", color_hex="#F39C12", sort_order=2, is_final_status=False),
        IssueStatus(status_id=3, name="In Review", color_hex="#9B59B6", sort_order=3, is_final_status=False),
        IssueStatus(status_id=4, name="Done", color_hex="#28B463", sort_order=4, is_final_status=True),
        IssueType(issue_type_id=1, name="Story"),
        IssueType(issue_type_id=2, name="Bug"),
        IssueType(issue_type_id=3, name="Epic"),
        IssuePriority(priority_id=1, name="High", sort_order=1),
    ])
    session.add(User(user_id=1, username="ada", email="ada@example.com", password_hash="x", display_name="Ada"))
    session.add(Project(project_id=1, project_key="ZY", name="Zyraa", lead_user_id=1))
    session.add(Board(board_id=1, project_id=1, name="Delivery", board_type="scrum"))
    session.commit()
    return session


def add_issue(
    session,
    issue_id: int,
    *,
    status_id: int,
    created_at: datetime,
    updated_at: datetime | None = None,
    issue_type_id: int = 1,
    estimate: float | None = None,
    transitions: list[tuple[datetime, str, str]] | None = None,
) -> Issue:
    """Insert an issue plus the status transitions that produced its current state."""
    issue = Issue(
        issue_id=issue_id,
        issue_key=f"ZY-{issue_id}",
        project_id=1,
        issue_type_id=issue_type_id,
        summary=f"Issue {issue_id}",
        status_id=status_id,
        priority_id=1,
        reporter_user_id=1,
        original_estimate=estimate,
        created_at=created_at,
        updated_at=updated_at or created_at,
    )
    session.add(issue)
    for changed_at, old_value, new_value in transitions or []:
        session.add(
            IssueHistory(
                issue_id=issue_id,
                user_id=1,
                field_name="status",
                old_value=old_value,
                new_value=new_value,
                changed_at=changed_at,
            )
        )
    session.commit()
    return issue


# ---------------------------------------------------------------------------


def test_status_catalog_assigns_flow_categories():
    session = build_session()
    catalog = svc.status_catalog(session)

    assert catalog["To Do"]["category"] == svc.TODO
    assert catalog["In Progress"]["category"] == svc.IN_PROGRESS
    assert catalog["In Review"]["category"] == svc.IN_PROGRESS
    assert catalog["Done"]["category"] == svc.DONE
    assert catalog["Done"]["is_final"] is True


def test_timeline_tracks_recorded_transitions():
    session = build_session()
    created = datetime(2026, 3, 1, 9, 0)
    add_issue(
        session,
        1,
        status_id=4,
        created_at=created,
        transitions=[
            (datetime(2026, 3, 3, 9, 0), "To Do", "In Progress"),
            (datetime(2026, 3, 6, 9, 0), "In Progress", "Done"),
        ],
    )
    catalog = svc.status_catalog(session)
    issues = session.query(Issue).all()
    timelines = svc.build_timelines(session, issues, catalog)
    timeline = timelines[1]

    assert timeline.estimated is False
    assert timeline.status_at(datetime(2026, 3, 2, 12, 0)) == "To Do"
    assert timeline.status_at(datetime(2026, 3, 4, 12, 0)) == "In Progress"
    assert timeline.status_at(datetime(2026, 3, 7, 12, 0)) == "Done"
    # Before it existed.
    assert timeline.status_at(datetime(2026, 2, 20, 12, 0)) is None
    assert timeline.first_entry_into({svc.IN_PROGRESS}, catalog) == datetime(2026, 3, 3, 9, 0)
    assert timeline.first_entry_into({svc.DONE}, catalog) == datetime(2026, 3, 6, 9, 0)


def test_timeline_flags_issues_without_recorded_history():
    session = build_session()
    add_issue(
        session,
        1,
        status_id=4,
        created_at=datetime(2026, 3, 1, 9, 0),
        updated_at=datetime(2026, 3, 5, 9, 0),
    )
    catalog = svc.status_catalog(session)
    timelines = svc.build_timelines(session, session.query(Issue).all(), catalog)

    assert timelines[1].estimated is True
    # Reconstructed: opens in To Do, lands on its current status at updated_at.
    assert timelines[1].status_at(datetime(2026, 3, 3, 9, 0)) == "To Do"
    assert timelines[1].status_at(datetime(2026, 3, 6, 9, 0)) == "Done"
    assert svc.coverage(timelines)["observed_ratio"] == 0.0


def test_burndown_counts_remaining_work_per_day():
    session = build_session()
    start, end = date(2026, 3, 2), date(2026, 3, 6)
    sprint = Sprint(sprint_id=1, board_id=1, name="Sprint 1", start_date=start, end_date=end, sprint_status="closed")
    session.add(sprint)

    # Three issues committed before the sprint opened; two finish inside it.
    before_sprint = datetime(2026, 3, 1, 9, 0)
    first = add_issue(session, 1, status_id=4, created_at=before_sprint,
                      transitions=[(datetime(2026, 3, 3, 9, 0), "To Do", "Done")])
    second = add_issue(session, 2, status_id=4, created_at=before_sprint,
                       transitions=[(datetime(2026, 3, 5, 9, 0), "To Do", "Done")])
    third = add_issue(session, 3, status_id=1, created_at=before_sprint)
    sprint.issues = [first, second, third]
    session.commit()

    result = svc.sprint_burndown(session, 1, unit=svc.UNIT_COUNT)
    remaining = {point["date"]: point["remaining"] for point in result["points"]}

    assert result["committed"] == 3.0
    assert remaining["2026-03-02"] == 3.0  # Nothing done yet.
    assert remaining["2026-03-03"] == 2.0  # First issue closed.
    assert remaining["2026-03-04"] == 2.0
    assert remaining["2026-03-05"] == 1.0  # Second issue closed.
    assert remaining["2026-03-06"] == 1.0
    # The ideal line runs from the committed total to zero across the sprint.
    assert result["points"][0]["ideal"] == 3.0
    assert result["points"][-1]["ideal"] == 0.0


def test_burndown_separates_scope_added_mid_sprint():
    session = build_session()
    sprint = Sprint(sprint_id=1, board_id=1, name="Sprint 1",
                    start_date=date(2026, 3, 2), end_date=date(2026, 3, 6), sprint_status="closed")
    session.add(sprint)
    committed = add_issue(session, 1, status_id=1, created_at=datetime(2026, 3, 1, 9, 0))
    late = add_issue(session, 2, status_id=1, created_at=datetime(2026, 3, 4, 9, 0))
    sprint.issues = [committed, late]
    session.commit()

    result = svc.sprint_burndown(session, 1, unit=svc.UNIT_COUNT)
    scope = {point["date"]: point["scope"] for point in result["points"]}

    assert result["committed"] == 1.0
    assert result["scope_added"] == 1.0
    assert scope["2026-03-03"] == 1.0  # Late issue does not exist yet.
    assert scope["2026-03-05"] == 2.0  # It has joined the sprint.


def test_burndown_in_hours_uses_original_estimate():
    session = build_session()
    sprint = Sprint(sprint_id=1, board_id=1, name="Sprint 1",
                    start_date=date(2026, 3, 2), end_date=date(2026, 3, 4), sprint_status="closed")
    session.add(sprint)
    first = add_issue(session, 1, status_id=4, created_at=datetime(2026, 3, 1, 9, 0), estimate=5,
                      transitions=[(datetime(2026, 3, 3, 9, 0), "To Do", "Done")])
    second = add_issue(session, 2, status_id=1, created_at=datetime(2026, 3, 1, 9, 0), estimate=3)
    sprint.issues = [first, second]
    session.commit()

    result = svc.sprint_burndown(session, 1, unit=svc.UNIT_HOURS)
    remaining = {point["date"]: point["remaining"] for point in result["points"]}

    assert result["committed"] == 8.0
    assert remaining["2026-03-02"] == 8.0
    assert remaining["2026-03-03"] == 3.0


def test_velocity_reports_committed_and_completed_per_sprint():
    session = build_session()
    first_sprint = Sprint(sprint_id=1, board_id=1, name="S1",
                          start_date=date(2026, 3, 2), end_date=date(2026, 3, 6),
                          sprint_status="closed", is_completed=True)
    second_sprint = Sprint(sprint_id=2, board_id=1, name="S2",
                           start_date=date(2026, 3, 9), end_date=date(2026, 3, 13),
                           sprint_status="closed", is_completed=True)
    session.add_all([first_sprint, second_sprint])

    a = add_issue(session, 1, status_id=4, created_at=datetime(2026, 3, 1, 9, 0),
                  transitions=[(datetime(2026, 3, 4, 9, 0), "To Do", "Done")])
    b = add_issue(session, 2, status_id=1, created_at=datetime(2026, 3, 1, 9, 0))
    c = add_issue(session, 3, status_id=4, created_at=datetime(2026, 3, 8, 9, 0),
                  transitions=[(datetime(2026, 3, 11, 9, 0), "To Do", "Done")])
    first_sprint.issues = [a, b]
    second_sprint.issues = [c]
    session.commit()

    result = svc.board_velocity(session, 1, unit=svc.UNIT_COUNT)
    sprints = {row["name"]: row for row in result["sprints"]}

    assert [row["name"] for row in result["sprints"]] == ["S1", "S2"]  # Oldest first.
    assert sprints["S1"]["committed"] == 2.0
    assert sprints["S1"]["completed"] == 1.0
    assert sprints["S2"]["completed"] == 1.0
    assert result["average_velocity"] == 1.0


def test_cumulative_flow_counts_every_issue_each_day():
    session = build_session()
    add_issue(session, 1, status_id=4, created_at=NOW - timedelta(days=10),
              transitions=[(NOW - timedelta(days=8), "To Do", "In Progress"),
                           (NOW - timedelta(days=4), "In Progress", "Done")])
    add_issue(session, 2, status_id=2, created_at=NOW - timedelta(days=6),
              transitions=[(NOW - timedelta(days=5), "To Do", "In Progress")])
    add_issue(session, 3, status_id=1, created_at=NOW - timedelta(days=2))

    result = svc.cumulative_flow(session, 1, days=14)
    latest = result["points"][-1]

    assert [series["key"] for series in result["series"]] == ["Done", "In Review", "In Progress", "To Do"]
    assert latest["Done"] == 1
    assert latest["In Progress"] == 1
    assert latest["To Do"] == 1
    # Totals never exceed the number of issues that existed on that day.
    for point in result["points"]:
        total = sum(point[series["key"]] for series in result["series"])
        assert total <= 3


def test_control_chart_measures_in_progress_to_done():
    session = build_session()
    add_issue(session, 1, status_id=4, created_at=NOW - timedelta(days=20),
              transitions=[(NOW - timedelta(days=10), "To Do", "In Progress"),
                           (NOW - timedelta(days=6), "In Progress", "Done")])
    # No in-progress event recorded: falls back to lead time from creation.
    add_issue(session, 2, status_id=4, created_at=NOW - timedelta(days=9),
              transitions=[(NOW - timedelta(days=7), "To Do", "Done")])

    result = svc.control_chart(session, 1, days=90)
    points = {point["issue_key"]: point for point in result["points"]}

    assert points["ZY-1"]["days"] == 4.0
    assert points["ZY-1"]["lead_time_fallback"] is False
    assert points["ZY-2"]["days"] == 2.0
    assert points["ZY-2"]["lead_time_fallback"] is True
    assert result["median_days"] == 3.0
    for point in result["points"]:
        assert point["band_lower"] <= point["rolling_average"] <= point["band_upper"]


def test_created_vs_resolved_tracks_the_open_backlog():
    session = build_session()
    add_issue(session, 1, status_id=4, created_at=NOW - timedelta(days=5),
              transitions=[(NOW - timedelta(days=3), "To Do", "Done")])
    add_issue(session, 2, status_id=1, created_at=NOW - timedelta(days=4))
    add_issue(session, 3, status_id=1, created_at=NOW - timedelta(days=1))

    result = svc.created_vs_resolved(session, 1, days=10, interval="day")

    assert result["total_created"] == 3
    assert result["total_resolved"] == 1
    assert result["points"][-1]["open"] == 2  # Two issues still open at the end.
    assert result["resolution_rate"] == round(1 / 3, 3)


def test_throughput_groups_completions_by_week_and_type():
    session = build_session()
    add_issue(session, 1, status_id=4, issue_type_id=1, created_at=NOW - timedelta(days=20),
              transitions=[(NOW - timedelta(days=3), "To Do", "Done")])
    add_issue(session, 2, status_id=4, issue_type_id=2, created_at=NOW - timedelta(days=20),
              transitions=[(NOW - timedelta(days=2), "To Do", "Done")])
    add_issue(session, 3, status_id=1, created_at=NOW - timedelta(days=20))

    result = svc.throughput(session, 1, days=28)

    assert result["series"] == ["Bug", "Story"]
    assert sum(point["total"] for point in result["points"]) == 2


def test_aging_wip_lists_only_in_flight_issues():
    session = build_session()
    add_issue(session, 1, status_id=2, created_at=NOW - timedelta(days=12),
              transitions=[(NOW - timedelta(days=9), "To Do", "In Progress")])
    add_issue(session, 2, status_id=1, created_at=NOW - timedelta(days=3))
    add_issue(session, 3, status_id=4, created_at=NOW - timedelta(days=20),
              transitions=[(NOW - timedelta(days=1), "To Do", "Done")])

    result = svc.aging_work_in_progress(session, 1)

    assert result["count"] == 1
    assert result["items"][0]["issue_key"] == "ZY-1"
    assert 8.5 < result["items"][0]["age_days"] < 9.5


def test_workload_excludes_completed_work():
    session = build_session()
    add_issue(session, 1, status_id=1, created_at=NOW - timedelta(days=3), estimate=4)
    add_issue(session, 2, status_id=2, created_at=NOW - timedelta(days=3), estimate=2)
    add_issue(session, 3, status_id=4, created_at=NOW - timedelta(days=3), estimate=8)

    result = svc.workload_breakdown(session, 1)
    unassigned = result["by_assignee"][0]

    assert unassigned["assignee"] == "Unassigned"
    assert unassigned["issues"] == 2  # The Done issue is not open work.
    assert unassigned["hours"] == 6.0
    assert {row["name"]: row["count"] for row in result["by_status"]}["Done"] == 1


def test_epic_progress_rolls_up_linked_children():
    session = build_session()
    add_issue(session, 1, status_id=1, issue_type_id=3, created_at=NOW - timedelta(days=30))
    add_issue(session, 2, status_id=4, created_at=NOW - timedelta(days=10),
              transitions=[(NOW - timedelta(days=5), "To Do", "Done")])
    add_issue(session, 3, status_id=2, created_at=NOW - timedelta(days=10))
    add_issue(session, 4, status_id=1, created_at=NOW - timedelta(days=10))
    session.add_all([
        IssueLink(issue_id_from=1, issue_id_to=2, link_type="parent-child"),
        IssueLink(issue_id_from=1, issue_id_to=3, link_type="parent-child"),
        IssueLink(issue_id_from=1, issue_id_to=4, link_type="parent-child"),
    ])
    session.commit()

    epic = svc.epic_progress(session, 1)["epics"][0]

    assert epic["total"] == 3
    assert epic["done"] == 1
    assert epic["in_progress"] == 1
    assert epic["todo"] == 1
    assert epic["percent_complete"] == 33.3


def test_project_overview_reports_totals_and_coverage():
    session = build_session()
    add_issue(session, 1, status_id=4, created_at=NOW - timedelta(days=10),
              transitions=[(NOW - timedelta(days=8), "To Do", "In Progress"),
                           (NOW - timedelta(days=5), "In Progress", "Done")])
    add_issue(session, 2, status_id=2, created_at=NOW - timedelta(days=6),
              transitions=[(NOW - timedelta(days=5), "To Do", "In Progress")])
    add_issue(session, 3, status_id=1, created_at=NOW - timedelta(days=2))

    result = svc.project_overview(session, 1, days=30)

    assert result["totals"] == {
        "issues": 3, "open": 1, "in_progress": 1, "done": 1,
        "completion_rate": 33.3,
    }
    assert result["created"]["current"] == 3
    assert result["resolved"]["current"] == 1
    assert result["median_cycle_time_days"] == 3.0
    # Two of three issues have recorded transitions.
    assert result["coverage"]["observed"] == 2
    assert result["coverage"]["estimated"] == 1


def test_empty_project_returns_usable_shapes():
    session = build_session()

    assert svc.project_overview(session, 1)["totals"]["issues"] == 0
    assert svc.control_chart(session, 1)["median_days"] is None
    assert svc.epic_progress(session, 1)["epics"] == []
    assert svc.aging_work_in_progress(session, 1)["count"] == 0
    assert svc.created_vs_resolved(session, 1)["resolution_rate"] is None
    assert svc.workload_breakdown(session, 1)["by_assignee"] == []


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
