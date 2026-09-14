import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app import crud, schemas
from app.api.v1.access_control import require_project_permission
from app.api.v1.dependencies import get_current_user
from app.database import get_db
from app.models import (
    Component,
    Issue,
    IssueComment,
    IssueHistory,
    IssueLink,
    IssuePriority,
    IssueStatus,
    IssueType,
    PullRequest,
    User,
    Version,
    Worklog,
)
from app.services.agent_service import recommend_issue_assignee
from app.services.code_analyzer import analyze_code_from_github, create_bugs_from_findings
from app.services.jql_service import search_issues

router = APIRouter(prefix="/issues", tags=["issues"])


def get_parent_epic(issue: Issue) -> Optional[Issue]:
    for link in issue.incoming_links:
        if link.link_type != "parent-child" or not link.issue_from:
            continue
        if link.issue_from.issue_type and link.issue_from.issue_type.name == "Epic":
            return link.issue_from
    return None


def generate_issue_key(db: Session, project_key: str, project_id: int) -> str:
    last_issue = (
        db.query(Issue)
        .filter(Issue.project_id == project_id)
        .order_by(Issue.issue_id.desc())
        .first()
    )
    if last_issue:
        match = re.search(r"-(\d+)$", last_issue.issue_key)
        if match:
            return f"{project_key}-{int(match.group(1)) + 1}"
    return f"{project_key}-1"


def serialize_issue(issue: Issue, recommendation: Optional[dict] = None) -> dict:
    epic = get_parent_epic(issue)
    return {
        "issue_id": issue.issue_id,
        "issue_key": issue.issue_key,
        "project_id": issue.project_id,
        "project_key": issue.project.project_key if issue.project else "",
        "issue_type": issue.issue_type.name if issue.issue_type else "",
        "summary": issue.summary,
        "description": issue.description,
        "priority": issue.priority.name if issue.priority else None,
        "status": issue.status.name if issue.status else "",
        "assignee_username": issue.assignee.username if issue.assignee else None,
        "component_name": issue.component.name if issue.component else None,
        "version_name": issue.version.name if issue.version else None,
        "original_estimate": float(issue.original_estimate) if issue.original_estimate is not None else None,
        "remaining_estimate": float(issue.remaining_estimate) if issue.remaining_estimate is not None else None,
        "due_date": issue.due_date,
        "label_names": [label.name for label in issue.labels],
        "reporter_username": issue.reporter.username if issue.reporter else "",
        "reporter_display_name": issue.reporter.display_name if issue.reporter else "",
        "time_spent": float(issue.time_spent or 0),
        "created_at": issue.created_at,
        "updated_at": issue.updated_at,
        "epic_issue_id": epic.issue_id if epic else None,
        "epic_issue_key": epic.issue_key if epic else None,
        "epic_issue_summary": epic.summary if epic else None,
        "resolution": issue.resolution.name if issue.resolution else None,
        "component_description": issue.component.description if issue.component else None,
        "version_released": issue.version.is_released if issue.version else None,
        "recommendation": recommendation,
    }


def validate_epic_assignment(issue: Issue, epic: Issue) -> None:
    issue_type_name = issue.issue_type.name if issue.issue_type else None
    epic_type_name = epic.issue_type.name if epic.issue_type else None

    if issue.issue_id == epic.issue_id:
        raise HTTPException(status_code=400, detail="An issue cannot be added to itself")
    if epic_type_name != "Epic":
        raise HTTPException(status_code=400, detail="Selected parent issue must be an Epic")
    if issue_type_name == "Epic":
        raise HTTPException(status_code=400, detail="Epic issues cannot be moved into another Epic")
    if issue.project_id != epic.project_id:
        raise HTTPException(status_code=400, detail="Story and Epic must belong to the same project")


def replace_parent_epic_link(db: Session, issue: Issue, epic: Optional[Issue]) -> None:
    existing_links = [
        link for link in issue.incoming_links
        if link.link_type == "parent-child"
        and link.issue_from
        and link.issue_from.issue_type
        and link.issue_from.issue_type.name == "Epic"
    ]

    for link in existing_links:
        db.delete(link)

    if epic is not None:
        db.add(IssueLink(issue_id_from=epic.issue_id, issue_id_to=issue.issue_id, link_type="parent-child"))


def serialize_comment(comment: IssueComment) -> dict:
    return {
        "comment_id": comment.comment_id,
        "issue_id": comment.issue_id,
        "user_id": comment.user_id,
        "body": comment.body,
        "username": comment.author.username if comment.author else "",
        "display_name": comment.author.display_name if comment.author else "",
        "created_at": comment.created_at,
        "updated_at": comment.updated_at,
    }


def serialize_worklog(worklog: Worklog) -> dict:
    return {
        "worklog_id": worklog.worklog_id,
        "issue_id": worklog.issue_id,
        "user_id": worklog.user_id,
        "time_spent": float(worklog.time_spent),
        "comment": worklog.comment,
        "started_at": worklog.started_at,
        "username": worklog.user.username if worklog.user else "",
        "display_name": worklog.user.display_name if worklog.user else "",
        "time_spent_seconds": worklog.time_spent_seconds,
        "created_at": worklog.created_at,
        "updated_at": worklog.updated_at,
    }


def queue_issue_assignment(issue: Issue) -> None:
    if not issue.assignee:
        return
    try:
        from app.services.task_processor import enqueue_email, enqueue_notification

        title = f"{issue.issue_key} assigned to you"
        message = f"You were assigned: {issue.summary}"
        enqueue_notification(issue.assignee.user_id, "issue_assigned", title, message, issue.issue_id)
        enqueue_email(
            recipient_email=issue.assignee.email,
            recipient_name=issue.assignee.display_name,
            subject=f"[ZYRAA] Issue Assigned: {issue.issue_key}",
            body_text=(
                f"Hello {issue.assignee.display_name},\n\n"
                f"You have been assigned {issue.issue_key}: {issue.summary}\n\n"
                f"Project: {issue.project.name if issue.project else issue.project_key}\n"
            ),
            template_name="issue_assigned",
            template_data={"issue_id": issue.issue_id, "issue_key": issue.issue_key},
        )
    except Exception:
        # Notification failures should not block issue mutations.
        return


HISTORY_FIELDS = ("status", "assignee", "priority", "issue_type")


def snapshot_issue_fields(issue: Issue) -> dict[str, str | None]:
    """Values of the fields tracked in issue history, captured before a mutation."""
    return {
        "status": issue.status_name or None,
        "assignee": issue.assignee.username if issue.assignee else None,
        "priority": issue.priority_name,
        "issue_type": issue.issue_type_name or None,
    }


def record_field_history(db: Session, issue: Issue, user: User, before: dict[str, str | None]) -> None:
    """Write an issue_history row for each tracked field that changed.

    The status rows are what analytics reads to build cycle time, cumulative
    flow, and burndown series, so this has to run on every path that moves an
    issue between statuses.
    """
    after = snapshot_issue_fields(issue)
    changes = [
        (field, before.get(field), after.get(field))
        for field in HISTORY_FIELDS
        if before.get(field) != after.get(field)
    ]
    if not changes:
        return
    try:
        for field, old_value, new_value in changes:
            db.add(
                IssueHistory(
                    issue_id=issue.issue_id,
                    user_id=user.user_id,
                    field_name=field,
                    old_value=old_value,
                    new_value=new_value,
                )
            )
        db.commit()
    except Exception:
        # History is observability, not a precondition for the mutation itself.
        db.rollback()


def write_audit(db: Session, user: User, action: str, entity: str, entity_id: int | None, values: dict | None = None) -> None:
    try:
        from app.middleware.audit import log_audit_event

        log_audit_event(
            db,
            action_type=action,
            entity_type=entity,
            entity_id=entity_id,
            new_values=values,
            user_id=user.user_id,
        )
    except Exception:
        db.rollback()


@router.post("/", response_model=schemas.IssueDetailResponse, status_code=status.HTTP_201_CREATED)
def create_issue(
    issue: schemas.IssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = crud.project.get_by_key(db, project_key=issue.project_key)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    require_project_permission(db, current_user, project.project_id, "issue.create")

    issue_type = db.query(IssueType).filter(IssueType.name == issue.issue_type.value).first()
    if not issue_type:
        raise HTTPException(status_code=400, detail=f"Issue type '{issue.issue_type.value}' not found")

    default_status = db.query(IssueStatus).filter(IssueStatus.name == "To Do").first()
    if not default_status:
        raise HTTPException(status_code=500, detail="Default status not found")

    assignee = None
    if issue.assignee_username:
        assignee = crud.user.get_by_username(db, username=issue.assignee_username)
        if not assignee:
            raise HTTPException(status_code=400, detail="Assignee not found")

    component = None
    if issue.component_name:
        component = (
            db.query(Component)
            .filter(Component.project_id == project.project_id, Component.name == issue.component_name)
            .first()
        )

    version = None
    if issue.version_name:
        version = (
            db.query(Version)
            .filter(Version.project_id == project.project_id, Version.name == issue.version_name)
            .first()
        )

    priority = None
    if issue.priority:
        priority = db.query(IssuePriority).filter(IssuePriority.name == issue.priority.value).first()

    db_issue = Issue(
        issue_key=generate_issue_key(db, project.project_key, project.project_id),
        project_id=project.project_id,
        issue_type_id=issue_type.issue_type_id,
        summary=issue.summary,
        description=issue.description,
        priority_id=priority.priority_id if priority else None,
        status_id=default_status.status_id,
        assignee_user_id=assignee.user_id if assignee else None,
        reporter_user_id=current_user.user_id,
        component_id=component.component_id if component else None,
        version_id=version.version_id if version else None,
        original_estimate=issue.original_estimate,
        remaining_estimate=issue.remaining_estimate,
        due_date=issue.due_date,
    )
    db.add(db_issue)
    db.commit()
    db.refresh(db_issue)

    if issue.epic_issue_key:
        epic = (
            db.query(Issue)
            .options(joinedload(Issue.issue_type))
            .filter(Issue.issue_key == issue.epic_issue_key)
            .first()
        )
        if epic is None:
            raise HTTPException(status_code=404, detail="Epic not found")
        validate_epic_assignment(db_issue, epic)
        replace_parent_epic_link(db, db_issue, epic)
        db.commit()
        db.refresh(db_issue)

    if issue.label_names:
        for label_name in issue.label_names:
            label = crud.label.get_or_create(db, name=label_name)
            db_issue.labels.append(label)
        db.commit()
        db.refresh(db_issue)

    recommendation_payload = None
    if issue.auto_assign and not assignee:
        recommendation = recommend_issue_assignee(db, db_issue)
        best = recommendation["best_assignee"]
        recommendation_payload = {
            "requirements": recommendation["requirements"],
            "candidate_scores": recommendation["candidates"],
            "best_assignee_username": best.username if best else None,
        }
        if best:
            db_issue.assignee_user_id = best.user_id
            db.commit()
            db.refresh(db_issue)

    queue_issue_assignment(db_issue)
    write_audit(db, current_user, "create", "issue", db_issue.issue_id, {"issue_key": db_issue.issue_key})
    return serialize_issue(db_issue, recommendation_payload)


@router.get("/", response_model=List[schemas.IssueResponse])
def read_issues(
    skip: int = 0,
    limit: int = 100,
    project_key: Optional[str] = None,
    issue_type_name: Optional[str] = None,
    assignee_username: Optional[str] = None,
    status_name: Optional[str] = None,
    priority_name: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(Issue)
        .options(
            joinedload(Issue.project),
            joinedload(Issue.issue_type),
            joinedload(Issue.priority),
            joinedload(Issue.status),
            joinedload(Issue.assignee),
            joinedload(Issue.reporter),
            joinedload(Issue.component),
            joinedload(Issue.version),
            joinedload(Issue.labels),
        )
    )

    if project_key:
        project = crud.project.get_by_key(db, project_key=project_key)
        query = query.filter(Issue.project_id == project.project_id) if project else query.filter(False)
    if issue_type_name:
        issue_type_obj = db.query(IssueType).filter(IssueType.name == issue_type_name).first()
        query = query.filter(Issue.issue_type_id == issue_type_obj.issue_type_id) if issue_type_obj else query.filter(False)
    if assignee_username:
        assignee = crud.user.get_by_username(db, username=assignee_username)
        query = query.filter(Issue.assignee_user_id == assignee.user_id) if assignee else query.filter(False)
    if status_name:
        status_obj = db.query(IssueStatus).filter(IssueStatus.name == status_name).first()
        query = query.filter(Issue.status_id == status_obj.status_id) if status_obj else query.filter(False)
    if priority_name:
        priority_obj = db.query(IssuePriority).filter(IssuePriority.name == priority_name).first()
        query = query.filter(Issue.priority_id == priority_obj.priority_id) if priority_obj else query.filter(False)
    if search:
        query = query.filter(
            (Issue.summary.ilike(f"%{search}%"))
            | (Issue.issue_key.ilike(f"%{search}%"))
            | (Issue.description.ilike(f"%{search}%"))
        )

    issues = query.order_by(Issue.issue_id.asc()).offset(skip).limit(limit).all()
    return [serialize_issue(issue) for issue in issues]


@router.get("/paginated", response_model=schemas.PaginatedResponse)
def read_issues_paginated(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    project_key: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Issue)
    if project_key:
        project = crud.project.get_by_key(db, project_key=project_key)
        query = query.filter(Issue.project_id == project.project_id) if project else query.filter(False)
    if search:
        like = f"%{search}%"
        query = query.filter((Issue.summary.ilike(like)) | (Issue.issue_key.ilike(like)) | (Issue.description.ilike(like)))

    total = query.count()
    issues = query.order_by(Issue.issue_id.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": [serialize_issue(issue) for issue in issues]}


@router.get("/search", response_model=schemas.PaginatedResponse)
def advanced_search_issues(
    jql: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total, issues = search_issues(jql, db, limit=page_size, offset=(page - 1) * page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": [serialize_issue(issue) for issue in issues]}


@router.get("/{issue_id}", response_model=schemas.IssueDetailResponse)
def read_issue(issue_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_issue = db.query(Issue).filter(Issue.issue_id == issue_id).first()
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return serialize_issue(db_issue)


@router.get("/key/{issue_key}", response_model=schemas.IssueDetailResponse)
def read_issue_by_key(issue_key: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_issue = crud.issue.get_by_key(db, issue_key=issue_key)
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    return serialize_issue(db_issue)


@router.put("/{issue_id}", response_model=schemas.IssueDetailResponse)
def update_issue(
    issue_id: int,
    issue_update: schemas.IssueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_issue = crud.issue.get(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    require_project_permission(db, current_user, db_issue.project_id, "issue.update")

    old_assignee_user_id = db_issue.assignee_user_id
    history_before = snapshot_issue_fields(db_issue)
    update_data = issue_update.model_dump(exclude_unset=True)
    target_project_id = db_issue.project_id

    if "project_key" in update_data:
        project_key = update_data.pop("project_key")
        if project_key:
            project = crud.project.get_by_key(db, project_key=project_key)
            if not project:
                raise HTTPException(status_code=400, detail="Project not found")
            if project.project_id != db_issue.project_id:
                require_project_permission(db, current_user, project.project_id, "issue.create")
                target_project_id = project.project_id
                db_issue.project_id = project.project_id
                db_issue.issue_key = generate_issue_key(db, project.project_key, project.project_id)
        else:
            raise HTTPException(status_code=400, detail="Project key cannot be empty")

    if "issue_type" in update_data and update_data["issue_type"]:
        issue_type_obj = db.query(IssueType).filter(IssueType.name == update_data.pop("issue_type").value).first()
        if not issue_type_obj:
            raise HTTPException(status_code=400, detail="Issue type not found")
        db_issue.issue_type_id = issue_type_obj.issue_type_id

    if "assignee_username" in update_data:
        assignee_username = update_data.pop("assignee_username")
        if assignee_username:
            assignee = crud.user.get_by_username(db, username=assignee_username)
            if not assignee:
                raise HTTPException(status_code=400, detail="Assignee not found")
            db_issue.assignee_user_id = assignee.user_id
        else:
            db_issue.assignee_user_id = None

    if "component_name" in update_data:
        component_name = update_data.pop("component_name")
        component = (
            db.query(Component)
            .filter(Component.project_id == target_project_id, Component.name == component_name)
            .first()
            if component_name
            else None
        )
        db_issue.component_id = component.component_id if component else None

    if "version_name" in update_data:
        version_name = update_data.pop("version_name")
        version = (
            db.query(Version)
            .filter(Version.project_id == target_project_id, Version.name == version_name)
            .first()
            if version_name
            else None
        )
        db_issue.version_id = version.version_id if version else None

    if "status" in update_data and update_data["status"]:
        status_obj = db.query(IssueStatus).filter(IssueStatus.name == update_data.pop("status").value).first()
        if not status_obj:
            raise HTTPException(status_code=400, detail="Status not found")
        db_issue.status_id = status_obj.status_id

    if "priority" in update_data:
        priority_value = update_data.pop("priority")
        if priority_value:
            priority_obj = db.query(IssuePriority).filter(IssuePriority.name == priority_value.value).first()
            if not priority_obj:
                raise HTTPException(status_code=400, detail="Priority not found")
            db_issue.priority_id = priority_obj.priority_id
        else:
            db_issue.priority_id = None

    label_names = update_data.pop("label_names", None)

    for field, value in update_data.items():
        setattr(db_issue, field, value)

    if label_names is not None:
        db_issue.labels = [crud.label.get_or_create(db, name=name) for name in label_names]

    db.commit()
    db.refresh(db_issue)
    record_field_history(db, db_issue, current_user, history_before)
    if db_issue.assignee_user_id and db_issue.assignee_user_id != old_assignee_user_id:
        queue_issue_assignment(db_issue)
    write_audit(db, current_user, "update", "issue", db_issue.issue_id, update_data)
    return serialize_issue(db_issue)


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(issue_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_issue = crud.issue.get(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    require_project_permission(db, current_user, db_issue.project_id, "issue.delete")
    db.delete(db_issue)
    db.commit()
    write_audit(db, current_user, "delete", "issue", issue_id, {"issue_id": issue_id})
    return None


@router.post("/{issue_id}/comments", response_model=schemas.CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    issue_id: int,
    comment: schemas.CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_issue = crud.issue.get(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    db_comment = IssueComment(issue_id=issue_id, user_id=current_user.user_id, body=comment.body)
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    if db_issue.assignee_user_id and db_issue.assignee_user_id != current_user.user_id:
        try:
            from app.services.task_processor import enqueue_notification

            enqueue_notification(
                db_issue.assignee_user_id,
                "issue_comment",
                f"New comment on {db_issue.issue_key}",
                comment.body[:500],
                db_issue.issue_id,
            )
        except Exception:
            pass
    write_audit(db, current_user, "comment", "issue", issue_id, {"comment_id": db_comment.comment_id})
    return serialize_comment(db_comment)


@router.get("/{issue_id}/comments", response_model=List[schemas.CommentResponse])
def read_issue_comments(
    issue_id: int,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comments = (
        db.query(IssueComment)
        .options(joinedload(IssueComment.author))
        .filter(IssueComment.issue_id == issue_id)
        .order_by(IssueComment.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [serialize_comment(comment) for comment in comments]


@router.post("/{issue_id}/worklogs", response_model=schemas.WorklogResponse, status_code=status.HTTP_201_CREATED)
def create_worklog(
    issue_id: int,
    worklog: schemas.WorklogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_issue = crud.issue.get(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    db_worklog = Worklog(
        issue_id=issue_id,
        user_id=current_user.user_id,
        time_spent=worklog.time_spent,
        time_spent_seconds=int(worklog.time_spent * 3600),
        comment=worklog.comment,
        started_at=worklog.started_at,
    )
    db.add(db_worklog)
    db.commit()
    db.refresh(db_worklog)
    return serialize_worklog(db_worklog)


@router.get("/{issue_id}/worklogs", response_model=List[schemas.WorklogResponse])
def read_issue_worklogs(
    issue_id: int,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worklogs = (
        db.query(Worklog)
        .options(joinedload(Worklog.user))
        .filter(Worklog.issue_id == issue_id)
        .order_by(Worklog.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [serialize_worklog(worklog) for worklog in worklogs]


@router.post("/{issue_id}/link")
def create_issue_link(
    issue_id: int,
    link: schemas.IssueLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_issue = crud.issue.get(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    require_project_permission(db, current_user, db_issue.project_id, "issue.update")

    linked_issue = crud.issue.get_by_key(db, issue_key=link.issue_key_to)
    if not linked_issue:
        raise HTTPException(status_code=404, detail="Linked issue not found")
    require_project_permission(db, current_user, linked_issue.project_id, "issue.update")

    link_obj = IssueLink(issue_id_from=issue_id, issue_id_to=linked_issue.issue_id, link_type=link.link_type)
    db.add(link_obj)
    db.commit()
    db.refresh(link_obj)
    return {"message": "Issue linked successfully", "link_id": link_obj.link_id}


@router.put("/{issue_id}/epic", response_model=schemas.IssueDetailResponse)
def update_issue_epic(
    issue_id: int,
    epic_update: schemas.IssueEpicUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_issue = (
        db.query(Issue)
        .options(
            joinedload(Issue.issue_type),
            joinedload(Issue.project),
            joinedload(Issue.priority),
            joinedload(Issue.status),
            joinedload(Issue.assignee),
            joinedload(Issue.reporter),
            joinedload(Issue.component),
            joinedload(Issue.version),
            joinedload(Issue.labels),
            joinedload(Issue.incoming_links).joinedload(IssueLink.issue_from).joinedload(Issue.issue_type),
        )
        .filter(Issue.issue_id == issue_id)
        .first()
    )
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    require_project_permission(db, current_user, db_issue.project_id, "issue.update")

    epic = None
    if epic_update.epic_issue_key:
        epic = (
            db.query(Issue)
            .options(joinedload(Issue.issue_type))
            .filter(Issue.issue_key == epic_update.epic_issue_key)
            .first()
        )
        if epic is None:
            raise HTTPException(status_code=404, detail="Epic not found")
        require_project_permission(db, current_user, epic.project_id, "project.read")
        validate_epic_assignment(db_issue, epic)

    replace_parent_epic_link(db, db_issue, epic)
    db.commit()
    db.refresh(db_issue)
    return serialize_issue(db_issue)


@router.post("/{issue_id}/pr")
def link_pull_request(
    issue_id: int,
    pr_data: schemas.PRCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    issue = crud.issue.get(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    require_project_permission(db, current_user, issue.project_id, "issue.update")

    pr = PullRequest(
        issue_id=issue_id,
        github_pr_number=pr_data.pr_number,
        repository_url=pr_data.repository_url,
        branch_name=pr_data.branch_name,
        status="linked",
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)

    health_score, findings = analyze_code_from_github(db, pr.pr_id, pr.repository_url, pr.github_pr_number)
    pr.health_score = health_score
    pr.status = "analyzed"
    db.commit()

    bugs = create_bugs_from_findings(db, pr.pr_id, findings, issue_id)
    return {
        "pr_id": pr.pr_id,
        "health_score": health_score,
        "findings_count": len(findings),
        "bugs_created": len(bugs),
    }


@router.post("/{issue_id}/attachments", status_code=status.HTTP_201_CREATED)
def upload_attachment(
    issue_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.attachment_service import create_attachment, save_upload_file

    db_issue = crud.issue.get(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    try:
        attachment = create_attachment(db, issue_id, current_user.user_id, file)
        return {
            "attachment_id": attachment.attachment_id,
            "filename": attachment.filename,
            "file_size": attachment.file_size,
            "mime_type": attachment.mime_type,
            "created_at": attachment.created_at,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")


@router.get("/{issue_id}/attachments", response_model=List[dict])
def get_attachments(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.attachment_service import get_issue_attachments

    db_issue = crud.issue.get(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    attachments = get_issue_attachments(db, issue_id)
    return [
        {
            "attachment_id": a.attachment_id,
            "filename": a.filename,
            "file_size": a.file_size,
            "mime_type": a.mime_type,
            "uploaded_by": a.uploader.display_name if a.uploader else "",
            "created_at": a.created_at,
        }
        for a in attachments
    ]


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.attachment_service import delete_attachment

    success = delete_attachment(db, attachment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return None


@router.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.attachment_service import get_attachment

    attachment = get_attachment(db, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return FileResponse(
        attachment.file_path,
        filename=attachment.filename,
        media_type=attachment.mime_type,
    )
