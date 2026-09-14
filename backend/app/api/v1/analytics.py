from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.v1.access_control import require_project_access
from app.api.v1.dependencies import get_current_user, get_db
from app.models import Board, Sprint, User
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])

Unit = Literal["count", "hours"]


def _board_project_id(db: Session, board_id: int) -> int:
    board = db.query(Board).filter(Board.board_id == board_id).first()
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board.project_id


def _sprint_project_id(db: Session, sprint_id: int) -> int:
    sprint = db.query(Sprint).filter(Sprint.sprint_id == sprint_id).first()
    if sprint is None:
        raise HTTPException(status_code=404, detail="Sprint not found")
    if sprint.board is None:
        raise HTTPException(status_code=404, detail="Sprint board not found")
    return sprint.board.project_id


@router.get("/projects/{project_id}/overview")
def project_overview(
    project_id: int,
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Headline delivery numbers with change against the prior window."""
    require_project_access(db, current_user, project_id)
    return analytics_service.project_overview(db, project_id, days=days)


@router.get("/projects/{project_id}/cumulative-flow")
def cumulative_flow(
    project_id: int,
    days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Issue count per status per day, for a cumulative flow diagram."""
    require_project_access(db, current_user, project_id)
    return analytics_service.cumulative_flow(db, project_id, days=days)


@router.get("/projects/{project_id}/control-chart")
def control_chart(
    project_id: int,
    days: int = Query(90, ge=7, le=730),
    rolling_window: int = Query(7, ge=2, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Cycle time per completed issue with a rolling average and deviation band."""
    require_project_access(db, current_user, project_id)
    return analytics_service.control_chart(db, project_id, days=days, rolling_window=rolling_window)


@router.get("/projects/{project_id}/created-vs-resolved")
def created_vs_resolved(
    project_id: int,
    days: int = Query(60, ge=7, le=730),
    interval: Literal["day", "week"] = Query("day"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Intake against completion over time, plus the resulting open backlog."""
    require_project_access(db, current_user, project_id)
    return analytics_service.created_vs_resolved(db, project_id, days=days, interval=interval)


@router.get("/projects/{project_id}/throughput")
def throughput(
    project_id: int,
    days: int = Query(84, ge=14, le=730),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Issues completed per week, split by issue type."""
    require_project_access(db, current_user, project_id)
    return analytics_service.throughput(db, project_id, days=days)


@router.get("/projects/{project_id}/aging-wip")
def aging_wip(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Currently in-progress issues ordered by how long they have been in flight."""
    require_project_access(db, current_user, project_id)
    return analytics_service.aging_work_in_progress(db, project_id)


@router.get("/projects/{project_id}/workload")
def workload(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Open work split by assignee, priority, type, and status."""
    require_project_access(db, current_user, project_id)
    return analytics_service.workload_breakdown(db, project_id)


@router.get("/projects/{project_id}/epic-progress")
def epic_progress(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Completion of each epic based on its linked child issues."""
    require_project_access(db, current_user, project_id)
    return analytics_service.epic_progress(db, project_id)


@router.get("/boards/{board_id}/velocity")
def board_velocity(
    board_id: int,
    limit: int = Query(8, ge=1, le=30),
    unit: Unit = Query("count"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Committed against completed work for recent sprints on a board."""
    require_project_access(db, current_user, _board_project_id(db, board_id))
    return analytics_service.board_velocity(db, board_id, limit=limit, unit=unit)


@router.get("/sprints/{sprint_id}/burndown")
def sprint_burndown(
    sprint_id: int,
    unit: Unit = Query("count"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Remaining work per day across a sprint, against the ideal path."""
    require_project_access(db, current_user, _sprint_project_id(db, sprint_id))
    try:
        return analytics_service.sprint_burndown(db, sprint_id, unit=unit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
