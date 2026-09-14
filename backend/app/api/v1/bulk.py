from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.v1.access_control import require_project_permission
from app.api.v1.dependencies import get_current_user
from app.database import get_db
from app import crud
from app.api.v1.issues import record_field_history, snapshot_issue_fields
from app.models import Issue, IssueStatus, User

router = APIRouter(prefix="/bulk", tags=["bulk"])


def _authorized_issues(db: Session, current_user: User, issue_ids: list[int], permission_key: str) -> list[Issue]:
    issues = db.query(Issue).filter(Issue.issue_id.in_(issue_ids)).all() if issue_ids else []
    for issue in issues:
        require_project_permission(db, current_user, issue.project_id, permission_key)
    return issues


@router.post("/issues/status", response_model=dict)
def bulk_update_status(
    operation: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    issue_ids = operation.get("issue_ids", [])
    status_name = operation.get("status")

    if not issue_ids or not status_name:
        raise HTTPException(status_code=400, detail="issue_ids and status are required")

    status_obj = db.query(IssueStatus).filter(IssueStatus.name == status_name).first()
    if not status_obj:
        raise HTTPException(status_code=404, detail="Status not found")

    issues = _authorized_issues(db, current_user, issue_ids, "issue.update")
    before = {issue.issue_id: snapshot_issue_fields(issue) for issue in issues}
    updated_count = 0
    for issue in issues:
        issue.status_id = status_obj.status_id
        updated_count += 1

    db.commit()
    for issue in issues:
        db.refresh(issue)
        record_field_history(db, issue, current_user, before[issue.issue_id])
    return {"updated_count": updated_count, "message": f"Updated {updated_count} issues"}


@router.post("/issues/assignee", response_model=dict)
def bulk_update_assignee(
    operation: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    issue_ids = operation.get("issue_ids", [])
    assignee_username = operation.get("assignee_username")

    if not issue_ids:
        raise HTTPException(status_code=400, detail="issue_ids is required")

    assignee = None
    if assignee_username:
        assignee = crud.user.get_by_username(db, username=assignee_username)
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee not found")

    issues = _authorized_issues(db, current_user, issue_ids, "issue.update")
    before = {issue.issue_id: snapshot_issue_fields(issue) for issue in issues}
    updated_count = 0
    for issue in issues:
        issue.assignee_user_id = assignee.user_id if assignee else None
        updated_count += 1

    db.commit()
    for issue in issues:
        db.refresh(issue)
        record_field_history(db, issue, current_user, before[issue.issue_id])
    return {"updated_count": updated_count, "message": f"Updated {updated_count} issues"}


@router.post("/issues/delete", response_model=dict)
def bulk_delete_issues(
    operation: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    issue_ids = operation.get("issue_ids", [])

    if not issue_ids:
        raise HTTPException(status_code=400, detail="issue_ids is required")

    issues = _authorized_issues(db, current_user, issue_ids, "issue.delete")
    deleted_count = 0
    for issue in issues:
        db.delete(issue)
        deleted_count += 1

    db.commit()
    return {"deleted_count": deleted_count, "message": f"Deleted {deleted_count} issues"}


@router.post("/issues/labels", response_model=dict)
def bulk_add_labels(
    operation: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    issue_ids = operation.get("issue_ids", [])
    labels = operation.get("labels", [])

    if not issue_ids or not labels:
        raise HTTPException(status_code=400, detail="issue_ids and labels are required")

    issues = _authorized_issues(db, current_user, issue_ids, "issue.update")
    updated_count = 0
    for issue in issues:
        for label_name in labels:
            label = crud.label.get_or_create(db, name=label_name)
            if label not in issue.labels:
                issue.labels.append(label)
        updated_count += 1

    db.commit()
    return {"updated_count": updated_count, "message": f"Updated {updated_count} issues"}
