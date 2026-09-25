from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Project, User
from app.services.permission_service import check_project_access, has_admin_permissions, has_user_permission


def require_project_access(db: Session, current_user: User, project_id: int) -> None:
    if has_admin_permissions(current_user) or check_project_access(db, current_user.user_id, project_id):
        return
    raise HTTPException(status_code=403, detail="Project access required")


def require_project_permission(db: Session, current_user: User, project_id: int, permission_key: str) -> None:
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if has_admin_permissions(current_user) or project.lead_user_id == current_user.user_id:
        return
    if has_user_permission(db, current_user.user_id, permission_key, project_id=project_id):
        return
    raise HTTPException(status_code=403, detail=f"Missing permission: {permission_key}")


# Actions a person may take on an issue that is about them, without holding a
# project role. Deletion is deliberately absent: removing work is a project-level
# decision even when it is your own issue.
ISSUE_OWNER_PERMISSIONS = {"issue.update"}


def require_issue_permission(db: Session, current_user: User, issue, permission_key: str) -> None:
    """Authorise an action against a single issue.

    A project role is the usual source of rights. On top of that, the two people
    an issue is actually about - its assignee and its reporter - may update it and
    log work against it. That pairing matters because project visibility is
    granted through assignment: without it, someone handed a single issue could
    open it and then be unable to move it or record time against it.
    """
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    if permission_key in ISSUE_OWNER_PERMISSIONS:
        owners = {issue.assignee_user_id, issue.reporter_user_id}
        if current_user.user_id in owners:
            return

    require_project_permission(db, current_user, issue.project_id, permission_key)


def require_action_owner(action, current_user: User) -> None:
    if action.user_id == current_user.user_id or has_admin_permissions(current_user):
        return
    raise HTTPException(status_code=403, detail="Action does not belong to current user")
