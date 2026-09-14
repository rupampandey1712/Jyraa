"""Delivery analytics computed from issue state and recorded status transitions.

Every metric here is derived from two sources: the current row in ``issues`` and
the status transitions recorded in ``issue_history``. Transitions are only
written from the moment history recording was switched on, so each function that
depends on them also reports how much of its input was reconstructed rather than
observed. Callers should surface that coverage instead of presenting estimated
series as measured ones.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any, Sequence

from sqlalchemy.orm import Session, joinedload

from app.models import Issue, IssueHistory, IssueLink, IssueStatus, Sprint

TODO = "todo"
IN_PROGRESS = "inprogress"
DONE = "done"

CATEGORY_ORDER = (TODO, IN_PROGRESS, DONE)

UNIT_COUNT = "count"
UNIT_HOURS = "hours"

# Names that mean "not started" regardless of the sort order an installation uses.
_TODO_NAMES = {"to do", "todo", "backlog", "open", "new", "created"}


# ---------------------------------------------------------------------------
# Status handling
# ---------------------------------------------------------------------------

def status_catalog(db: Session) -> dict[str, dict[str, Any]]:
    """Name-keyed status metadata, including the flow category each status maps to."""
    statuses = db.query(IssueStatus).order_by(IssueStatus.sort_order).all()
    if not statuses:
        return {}

    first_sort = statuses[0].sort_order
    catalog: dict[str, dict[str, Any]] = {}
    for status in statuses:
        catalog[status.name] = {
            "name": status.name,
            "color": status.color_hex,
            "sort_order": status.sort_order,
            "is_final": bool(status.is_final_status),
            "category": _categorize(status.name, status.sort_order, status.is_final_status, first_sort),
        }
    return catalog


def _categorize(name: str, sort_order: int, is_final: bool, first_sort: int) -> str:
    if is_final:
        return DONE
    if (name or "").strip().lower() in _TODO_NAMES or sort_order <= first_sort:
        return TODO
    return IN_PROGRESS


def _initial_status_name(catalog: dict[str, dict[str, Any]]) -> str | None:
    todo = [meta for meta in catalog.values() if meta["category"] == TODO]
    if not todo:
        return None
    return min(todo, key=lambda meta: meta["sort_order"])["name"]


def _is_done(status_name: str | None, catalog: dict[str, dict[str, Any]]) -> bool:
    meta = catalog.get(status_name or "")
    return bool(meta and meta["category"] == DONE)


# ---------------------------------------------------------------------------
# Timelines
# ---------------------------------------------------------------------------

class Timeline:
    """An issue's status over time, plus whether it was observed or reconstructed."""

    __slots__ = ("issue_id", "points", "estimated", "created_at")

    def __init__(self, issue_id: int, points: list[tuple[datetime, str]], estimated: bool, created_at: datetime):
        self.issue_id = issue_id
        self.points = points
        self.estimated = estimated
        self.created_at = created_at

    def status_at(self, moment: datetime) -> str | None:
        """Status as of ``moment``, or None if the issue did not exist yet."""
        if self.created_at > moment:
            return None
        current = None
        for changed_at, status_name in self.points:
            if changed_at > moment:
                break
            current = status_name
        return current

    def first_entry_into(self, categories: set[str], catalog: dict[str, dict[str, Any]]) -> datetime | None:
        """When the issue first reached any status in ``categories``."""
        for changed_at, status_name in self.points:
            meta = catalog.get(status_name)
            if meta and meta["category"] in categories:
                return changed_at
        return None


def build_timelines(
    db: Session,
    issues: Sequence[Issue],
    catalog: dict[str, dict[str, Any]],
) -> dict[int, Timeline]:
    """Reconstruct a status timeline per issue from recorded transitions.

    Issues with no recorded transitions are reconstructed from ``created_at`` and
    ``updated_at`` and flagged ``estimated`` so metrics can report coverage.
    """
    if not issues:
        return {}

    issue_ids = [issue.issue_id for issue in issues]
    by_issue: dict[int, list[IssueHistory]] = defaultdict(list)

    # SQL Server caps the number of parameters in an IN clause, so chunk lookups.
    for chunk_start in range(0, len(issue_ids), 1000):
        chunk = issue_ids[chunk_start:chunk_start + 1000]
        rows = (
            db.query(IssueHistory)
            .filter(IssueHistory.issue_id.in_(chunk), IssueHistory.field_name == "status")
            .order_by(IssueHistory.issue_id, IssueHistory.changed_at)
            .all()
        )
        for row in rows:
            by_issue[row.issue_id].append(row)

    initial_status = _initial_status_name(catalog)
    timelines: dict[int, Timeline] = {}

    for issue in issues:
        created_at = issue.created_at or datetime.utcnow()
        current = issue.status_name or initial_status or ""
        rows = by_issue.get(issue.issue_id, [])

        if rows:
            opening = rows[0].old_value or initial_status or current
            points = [(created_at, opening)]
            for row in rows:
                changed_at = row.changed_at or created_at
                if changed_at < created_at:
                    changed_at = created_at
                points.append((changed_at, row.new_value or current))
            timelines[issue.issue_id] = Timeline(issue.issue_id, points, False, created_at)
            continue

        # No recorded transitions: place the current status at updated_at when the
        # issue has clearly moved since creation, otherwise treat it as unchanged.
        updated_at = issue.updated_at or created_at
        if updated_at > created_at and initial_status and current != initial_status:
            points = [(created_at, initial_status), (updated_at, current)]
        else:
            points = [(created_at, current)]
        timelines[issue.issue_id] = Timeline(issue.issue_id, points, True, created_at)

    return timelines


def coverage(timelines: dict[int, Timeline]) -> dict[str, Any]:
    """How much of a metric's input came from recorded transitions."""
    total = len(timelines)
    if not total:
        return {"issues": 0, "observed": 0, "estimated": 0, "observed_ratio": 1.0}
    estimated = sum(1 for timeline in timelines.values() if timeline.estimated)
    observed = total - estimated
    return {
        "issues": total,
        "observed": observed,
        "estimated": estimated,
        "observed_ratio": round(observed / total, 4),
    }


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def issue_value(issue: Issue, unit: str) -> float:
    """The quantity a burndown or velocity chart sums for this issue.

    There is no story-point column on ``issues``, so ``hours`` uses
    ``original_estimate`` and ``count`` weights every issue equally.
    """
    if unit == UNIT_HOURS:
        return float(issue.original_estimate or 0)
    return 1.0


def _end_of_day(day: date) -> datetime:
    return datetime.combine(day, time.max)


def _day_range(start: date, end: date) -> list[date]:
    if end < start:
        return []
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def _load_project_issues(db: Session, project_id: int) -> list[Issue]:
    return (
        db.query(Issue)
        .options(
            joinedload(Issue.status),
            joinedload(Issue.issue_type),
            joinedload(Issue.assignee),
            joinedload(Issue.priority),
        )
        .filter(Issue.project_id == project_id)
        .all()
    )


# ---------------------------------------------------------------------------
# Sprint burndown
# ---------------------------------------------------------------------------

def sprint_burndown(db: Session, sprint_id: int, unit: str = UNIT_COUNT) -> dict[str, Any]:
    """Remaining work per day across a sprint, against the ideal linear path."""
    sprint = db.query(Sprint).filter(Sprint.sprint_id == sprint_id).first()
    if sprint is None:
        raise ValueError("Sprint not found")

    catalog = status_catalog(db)
    issues = list(sprint.issues)
    timelines = build_timelines(db, issues, catalog)

    days = _day_range(sprint.start_date, sprint.end_date)
    today = datetime.utcnow().date()

    # Work committed at the start: issues that already existed when the sprint opened.
    sprint_start = datetime.combine(sprint.start_date, time.min)
    committed = sum(
        issue_value(issue, unit)
        for issue in issues
        if (issue.created_at or sprint_start) <= sprint_start
    )
    total_scope = sum(issue_value(issue, unit) for issue in issues)
    if committed <= 0:
        committed = total_scope

    points: list[dict[str, Any]] = []
    step = committed / max(len(days) - 1, 1)

    for index, day in enumerate(days):
        moment = _end_of_day(day)
        ideal = round(max(committed - step * index, 0.0), 2)

        if day > today:
            points.append({"date": day.isoformat(), "remaining": None, "ideal": ideal, "scope": None, "completed": None})
            continue

        remaining = 0.0
        scope = 0.0
        completed = 0.0
        for issue in issues:
            timeline = timelines.get(issue.issue_id)
            if timeline is None:
                continue
            status_name = timeline.status_at(moment)
            if status_name is None:
                continue  # Not yet created on this day.
            value = issue_value(issue, unit)
            scope += value
            if _is_done(status_name, catalog):
                completed += value
            else:
                remaining += value

        points.append({
            "date": day.isoformat(),
            "remaining": round(remaining, 2),
            "ideal": ideal,
            "scope": round(scope, 2),
            "completed": round(completed, 2),
        })

    added_mid_sprint = round(total_scope - committed, 2)

    return {
        "sprint": {
            "sprint_id": sprint.sprint_id,
            "name": sprint.name,
            "goal": sprint.goal,
            "start_date": sprint.start_date.isoformat(),
            "end_date": sprint.end_date.isoformat(),
            "status": sprint.sprint_status,
            "is_completed": bool(sprint.is_completed),
        },
        "unit": unit,
        "committed": round(committed, 2),
        "scope_added": added_mid_sprint,
        "points": points,
        "coverage": coverage(timelines),
    }


# ---------------------------------------------------------------------------
# Velocity
# ---------------------------------------------------------------------------

def board_velocity(db: Session, board_id: int, limit: int = 8, unit: str = UNIT_COUNT) -> dict[str, Any]:
    """Committed vs completed work for the most recent closed sprints on a board."""
    sprints = (
        db.query(Sprint)
        .filter(Sprint.board_id == board_id)
        .order_by(Sprint.end_date.desc())
        .limit(limit)
        .all()
    )
    sprints.reverse()  # Oldest first, so the chart reads left to right.

    catalog = status_catalog(db)
    rows: list[dict[str, Any]] = []
    all_timelines: dict[int, Timeline] = {}

    for sprint in sprints:
        issues = list(sprint.issues)
        timelines = build_timelines(db, issues, catalog)
        all_timelines.update(timelines)

        sprint_end = _end_of_day(sprint.end_date)
        sprint_start = datetime.combine(sprint.start_date, time.min)

        committed = 0.0
        completed = 0.0
        for issue in issues:
            value = issue_value(issue, unit)
            if (issue.created_at or sprint_start) <= sprint_start:
                committed += value
            timeline = timelines.get(issue.issue_id)
            if timeline and _is_done(timeline.status_at(sprint_end), catalog):
                completed += value

        if committed <= 0:
            committed = sum(issue_value(issue, unit) for issue in issues)

        rows.append({
            "sprint_id": sprint.sprint_id,
            "name": sprint.name,
            "end_date": sprint.end_date.isoformat(),
            "committed": round(committed, 2),
            "completed": round(completed, 2),
            "issue_count": len(issues),
        })

    completed_values = [row["completed"] for row in rows if row["issue_count"]]
    average = round(statistics.fmean(completed_values), 2) if completed_values else 0.0

    return {
        "unit": unit,
        "sprints": rows,
        "average_velocity": average,
        "predictability": _predictability(rows),
        "coverage": coverage(all_timelines),
    }


def _predictability(rows: list[dict[str, Any]]) -> float | None:
    """Mean ratio of completed to committed work; 1.0 means the team lands its plan."""
    ratios = [row["completed"] / row["committed"] for row in rows if row["committed"] > 0]
    if not ratios:
        return None
    return round(statistics.fmean(ratios), 3)


# ---------------------------------------------------------------------------
# Cumulative flow
# ---------------------------------------------------------------------------

def cumulative_flow(db: Session, project_id: int, days: int = 30) -> dict[str, Any]:
    """Issue count per status, per day, stacked from done upward."""
    catalog = status_catalog(db)
    issues = _load_project_issues(db, project_id)
    timelines = build_timelines(db, issues, catalog)

    end = datetime.utcnow().date()
    start = end - timedelta(days=max(days - 1, 0))

    ordered_statuses = sorted(catalog.values(), key=lambda meta: meta["sort_order"], reverse=True)
    series_names = [meta["name"] for meta in ordered_statuses]

    points: list[dict[str, Any]] = []
    for day in _day_range(start, end):
        moment = _end_of_day(day)
        buckets = {name: 0 for name in series_names}
        for timeline in timelines.values():
            status_name = timeline.status_at(moment)
            if status_name is None:
                continue
            if status_name in buckets:
                buckets[status_name] += 1
        points.append({"date": day.isoformat(), **buckets})

    return {
        "series": [
            {"key": meta["name"], "color": meta["color"], "category": meta["category"]}
            for meta in ordered_statuses
        ],
        "points": points,
        "coverage": coverage(timelines),
    }


# ---------------------------------------------------------------------------
# Control chart (cycle time)
# ---------------------------------------------------------------------------

def control_chart(db: Session, project_id: int, days: int = 90, rolling_window: int = 7) -> dict[str, Any]:
    """Cycle time per completed issue, with a rolling average and deviation band.

    Cycle time is measured from first entry into an in-progress status to first
    entry into a final status. Issues that were never observed in progress fall
    back to lead time (created to done) and are marked so the chart can show them
    differently.
    """
    catalog = status_catalog(db)
    issues = _load_project_issues(db, project_id)
    timelines = build_timelines(db, issues, catalog)

    cutoff = datetime.utcnow() - timedelta(days=days)
    points: list[dict[str, Any]] = []

    for issue in issues:
        timeline = timelines.get(issue.issue_id)
        if timeline is None:
            continue
        done_at = timeline.first_entry_into({DONE}, catalog)
        if done_at is None or done_at < cutoff:
            continue

        started_at = timeline.first_entry_into({IN_PROGRESS}, catalog)
        is_lead_time = started_at is None
        if is_lead_time:
            started_at = timeline.created_at
        if done_at < started_at:
            continue

        elapsed_days = (done_at - started_at).total_seconds() / 86400.0
        points.append({
            "issue_id": issue.issue_id,
            "issue_key": issue.issue_key,
            "summary": issue.summary,
            "completed_at": done_at.isoformat(),
            "days": round(elapsed_days, 2),
            "issue_type": issue.issue_type_name,
            "lead_time_fallback": is_lead_time,
            "estimated": timeline.estimated,
        })

    points.sort(key=lambda point: point["completed_at"])

    values = [point["days"] for point in points]
    window: list[float] = []
    for index, point in enumerate(points):
        window = values[max(0, index - rolling_window + 1):index + 1]
        mean = statistics.fmean(window)
        deviation = statistics.pstdev(window) if len(window) > 1 else 0.0
        point["rolling_average"] = round(mean, 2)
        point["band_upper"] = round(mean + deviation, 2)
        point["band_lower"] = round(max(mean - deviation, 0.0), 2)

    return {
        "points": points,
        "median_days": round(statistics.median(values), 2) if values else None,
        "p85_days": round(_percentile(values, 0.85), 2) if values else None,
        "mean_days": round(statistics.fmean(values), 2) if values else None,
        "coverage": coverage(timelines),
    }


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(int(round(fraction * (len(ordered) - 1))), len(ordered) - 1)
    return ordered[index]


# ---------------------------------------------------------------------------
# Created vs resolved
# ---------------------------------------------------------------------------

def created_vs_resolved(db: Session, project_id: int, days: int = 60, interval: str = "day") -> dict[str, Any]:
    """Intake against completion over time, with the resulting open backlog."""
    catalog = status_catalog(db)
    issues = _load_project_issues(db, project_id)
    timelines = build_timelines(db, issues, catalog)

    end = datetime.utcnow().date()
    start = end - timedelta(days=max(days - 1, 0))

    created_by_day: dict[date, int] = defaultdict(int)
    resolved_by_day: dict[date, int] = defaultdict(int)
    backlog_before_window = 0

    for issue in issues:
        timeline = timelines.get(issue.issue_id)
        created_on = (issue.created_at or datetime.utcnow()).date()
        done_at = timeline.first_entry_into({DONE}, catalog) if timeline else None
        resolved_on = done_at.date() if done_at else None

        if created_on < start:
            if resolved_on is None or resolved_on >= start:
                backlog_before_window += 1
        elif created_on <= end:
            created_by_day[created_on] += 1

        if resolved_on is not None and start <= resolved_on <= end:
            resolved_by_day[resolved_on] += 1

    buckets = _bucket_days(_day_range(start, end), interval)

    points: list[dict[str, Any]] = []
    open_running = backlog_before_window
    for label, bucket_days in buckets:
        created = sum(created_by_day.get(day, 0) for day in bucket_days)
        resolved = sum(resolved_by_day.get(day, 0) for day in bucket_days)
        open_running += created - resolved
        points.append({
            "period": label,
            "created": created,
            "resolved": resolved,
            "net": created - resolved,
            "open": max(open_running, 0),
        })

    total_created = sum(point["created"] for point in points)
    total_resolved = sum(point["resolved"] for point in points)

    return {
        "interval": interval,
        "points": points,
        "total_created": total_created,
        "total_resolved": total_resolved,
        "resolution_rate": round(total_resolved / total_created, 3) if total_created else None,
        "coverage": coverage(timelines),
    }


def _bucket_days(days: list[date], interval: str) -> list[tuple[str, list[date]]]:
    if interval == "week":
        grouped: dict[date, list[date]] = defaultdict(list)
        for day in days:
            week_start = day - timedelta(days=day.weekday())
            grouped[week_start].append(day)
        return [(week_start.isoformat(), members) for week_start, members in sorted(grouped.items())]
    return [(day.isoformat(), [day]) for day in days]


# ---------------------------------------------------------------------------
# Throughput and work-in-progress age
# ---------------------------------------------------------------------------

def throughput(db: Session, project_id: int, days: int = 84) -> dict[str, Any]:
    """Issues completed per week, by issue type."""
    catalog = status_catalog(db)
    issues = _load_project_issues(db, project_id)
    timelines = build_timelines(db, issues, catalog)

    end = datetime.utcnow().date()
    start = end - timedelta(days=max(days - 1, 0))

    by_week: dict[date, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    type_names: set[str] = set()

    for issue in issues:
        timeline = timelines.get(issue.issue_id)
        if timeline is None:
            continue
        done_at = timeline.first_entry_into({DONE}, catalog)
        if done_at is None:
            continue
        completed_on = done_at.date()
        if completed_on < start or completed_on > end:
            continue
        week_start = completed_on - timedelta(days=completed_on.weekday())
        type_name = issue.issue_type_name or "Unspecified"
        by_week[week_start][type_name] += 1
        type_names.add(type_name)

    weeks = sorted({day - timedelta(days=day.weekday()) for day in _day_range(start, end)})
    ordered_types = sorted(type_names)

    points = []
    for week_start in weeks:
        row: dict[str, Any] = {"period": week_start.isoformat()}
        bucket = by_week.get(week_start, {})
        for type_name in ordered_types:
            row[type_name] = bucket.get(type_name, 0)
        row["total"] = sum(bucket.values())
        points.append(row)

    totals = [point["total"] for point in points]

    return {
        "series": ordered_types,
        "points": points,
        "average_per_week": round(statistics.fmean(totals), 2) if totals else 0.0,
        "coverage": coverage(timelines),
    }


def aging_work_in_progress(db: Session, project_id: int) -> dict[str, Any]:
    """How long each currently in-progress issue has been in flight."""
    catalog = status_catalog(db)
    issues = _load_project_issues(db, project_id)
    timelines = build_timelines(db, issues, catalog)

    now = datetime.utcnow()
    rows: list[dict[str, Any]] = []

    for issue in issues:
        meta = catalog.get(issue.status_name or "")
        if not meta or meta["category"] != IN_PROGRESS:
            continue
        timeline = timelines.get(issue.issue_id)
        started_at = timeline.first_entry_into({IN_PROGRESS}, catalog) if timeline else None
        if started_at is None:
            started_at = issue.created_at or now
        rows.append({
            "issue_id": issue.issue_id,
            "issue_key": issue.issue_key,
            "summary": issue.summary,
            "status": issue.status_name,
            "assignee": issue.assignee.display_name if issue.assignee else None,
            "priority": issue.priority_name,
            "age_days": round((now - started_at).total_seconds() / 86400.0, 2),
            "estimated": bool(timeline and timeline.estimated),
        })

    rows.sort(key=lambda row: row["age_days"], reverse=True)
    ages = [row["age_days"] for row in rows]

    return {
        "items": rows,
        "count": len(rows),
        "median_age_days": round(statistics.median(ages), 2) if ages else None,
        "oldest_age_days": round(max(ages), 2) if ages else None,
    }


# ---------------------------------------------------------------------------
# Composition snapshots
# ---------------------------------------------------------------------------

def workload_breakdown(db: Session, project_id: int) -> dict[str, Any]:
    """Open work split by assignee, priority, type, and status."""
    catalog = status_catalog(db)
    issues = _load_project_issues(db, project_id)

    by_assignee: dict[str, dict[str, Any]] = {}
    by_priority: dict[str, int] = defaultdict(int)
    by_type: dict[str, int] = defaultdict(int)
    by_status: dict[str, int] = defaultdict(int)

    for issue in issues:
        meta = catalog.get(issue.status_name or "")
        is_done = bool(meta and meta["category"] == DONE)
        by_status[issue.status_name or "Unknown"] += 1
        if is_done:
            continue

        name = issue.assignee.display_name if issue.assignee else "Unassigned"
        entry = by_assignee.setdefault(name, {"assignee": name, "issues": 0, "hours": 0.0})
        entry["issues"] += 1
        entry["hours"] += float(issue.remaining_estimate or issue.original_estimate or 0)

        by_priority[issue.priority_name or "Unprioritised"] += 1
        by_type[issue.issue_type_name or "Unspecified"] += 1

    assignees = sorted(by_assignee.values(), key=lambda row: row["issues"], reverse=True)
    for row in assignees:
        row["hours"] = round(row["hours"], 2)

    return {
        "by_assignee": assignees,
        "by_priority": [
            {"name": name, "count": count}
            for name, count in sorted(by_priority.items(), key=lambda item: item[1], reverse=True)
        ],
        "by_type": [
            {"name": name, "count": count}
            for name, count in sorted(by_type.items(), key=lambda item: item[1], reverse=True)
        ],
        "by_status": [
            {
                "name": name,
                "count": count,
                "color": catalog.get(name, {}).get("color"),
                "category": catalog.get(name, {}).get("category"),
            }
            for name, count in sorted(
                by_status.items(),
                key=lambda item: catalog.get(item[0], {}).get("sort_order", 999),
            )
        ],
    }


def epic_progress(db: Session, project_id: int) -> dict[str, Any]:
    """Completion of each epic in the project, based on its linked children."""
    catalog = status_catalog(db)
    issues = _load_project_issues(db, project_id)
    by_id = {issue.issue_id: issue for issue in issues}

    epics = [issue for issue in issues if (issue.issue_type_name or "") == "Epic"]
    if not epics:
        return {"epics": []}

    epic_ids = [epic.issue_id for epic in epics]
    links = (
        db.query(IssueLink)
        .filter(IssueLink.link_type == "parent-child", IssueLink.issue_id_from.in_(epic_ids))
        .all()
    )
    children: dict[int, list[Issue]] = defaultdict(list)
    for link in links:
        child = by_id.get(link.issue_id_to)
        if child is not None:
            children[link.issue_id_from].append(child)

    rows: list[dict[str, Any]] = []
    for epic in epics:
        members = children.get(epic.issue_id, [])
        done = sum(1 for child in members if _is_done(child.status_name, catalog))
        in_progress = sum(
            1 for child in members
            if catalog.get(child.status_name or "", {}).get("category") == IN_PROGRESS
        )
        rows.append({
            "issue_id": epic.issue_id,
            "issue_key": epic.issue_key,
            "summary": epic.summary,
            "status": epic.status_name,
            "total": len(members),
            "done": done,
            "in_progress": in_progress,
            "todo": len(members) - done - in_progress,
            "percent_complete": round(done / len(members) * 100, 1) if members else 0.0,
            "estimate_hours": round(sum(float(child.original_estimate or 0) for child in members), 2),
        })

    rows.sort(key=lambda row: row["percent_complete"], reverse=True)
    return {"epics": rows}


# ---------------------------------------------------------------------------
# Project overview
# ---------------------------------------------------------------------------

def project_overview(db: Session, project_id: int, days: int = 30) -> dict[str, Any]:
    """Headline numbers for a project, with change against the prior period."""
    catalog = status_catalog(db)
    issues = _load_project_issues(db, project_id)
    timelines = build_timelines(db, issues, catalog)

    now = datetime.utcnow()
    window_start = now - timedelta(days=days)
    previous_start = now - timedelta(days=days * 2)

    created_now = created_prev = resolved_now = resolved_prev = 0
    open_count = in_progress_count = done_count = 0
    cycle_times: list[float] = []

    for issue in issues:
        timeline = timelines.get(issue.issue_id)
        created_at = issue.created_at or now
        if created_at >= window_start:
            created_now += 1
        elif created_at >= previous_start:
            created_prev += 1

        category = catalog.get(issue.status_name or "", {}).get("category")
        if category == DONE:
            done_count += 1
        elif category == IN_PROGRESS:
            in_progress_count += 1
        else:
            open_count += 1

        if timeline is None:
            continue
        done_at = timeline.first_entry_into({DONE}, catalog)
        if done_at is None:
            continue
        if done_at >= window_start:
            resolved_now += 1
            started_at = timeline.first_entry_into({IN_PROGRESS}, catalog) or timeline.created_at
            if done_at >= started_at:
                cycle_times.append((done_at - started_at).total_seconds() / 86400.0)
        elif done_at >= previous_start:
            resolved_prev += 1

    total = len(issues)
    return {
        "window_days": days,
        "totals": {
            "issues": total,
            "open": open_count,
            "in_progress": in_progress_count,
            "done": done_count,
            "completion_rate": round(done_count / total * 100, 1) if total else 0.0,
        },
        "created": {"current": created_now, "previous": created_prev, "change": _change(created_now, created_prev)},
        "resolved": {"current": resolved_now, "previous": resolved_prev, "change": _change(resolved_now, resolved_prev)},
        "median_cycle_time_days": round(statistics.median(cycle_times), 2) if cycle_times else None,
        "coverage": coverage(timelines),
    }


def _change(current: int, previous: int) -> float | None:
    """Percentage change against the previous period, or None when undefined."""
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)
