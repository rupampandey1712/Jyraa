from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, date
from typing import Any, Literal, Optional, List
from enum import Enum


# Enums
class IssueTypeEnum(str, Enum):
    epic = "Epic"
    story = "Story"
    task = "Task"
    bug = "Bug"
    subtask = "Subtask"


class PriorityEnum(str, Enum):
    highest = "Highest"
    high = "High"
    medium = "Medium"
    low = "Low"
    lowest = "Lowest"


class StatusEnum(str, Enum):
    todo = "To Do"
    in_progress = "In Progress"
    in_review = "In Review"
    done = "Done"
    cancelled = "Cancelled"


class BoardTypeEnum(str, Enum):
    kanban = "kanban"
    scrum = "scrum"


# User schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    display_name: str


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str = Field(..., min_length=8)
    display_name: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class UserResponse(UserBase):
    user_id: int
    is_active: bool
    created_at: datetime
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


# Project schemas
class ProjectBase(BaseModel):
    project_key: str
    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_archived: Optional[bool] = None


class ProjectResponse(ProjectBase):
    project_id: int
    lead_user_id: Optional[int] = None
    project_type: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Issue schemas
class IssueBase(BaseModel):
    project_key: str
    issue_type: IssueTypeEnum
    summary: str = Field(..., max_length=500)
    description: Optional[str] = None
    priority: Optional[PriorityEnum] = None
    assignee_username: Optional[str] = None
    component_name: Optional[str] = None
    version_name: Optional[str] = None
    original_estimate: Optional[float] = None
    remaining_estimate: Optional[float] = None
    due_date: Optional[date] = None
    label_names: List[str] = []


class IssueCreate(IssueBase):
    auto_assign: bool = False
    epic_issue_key: Optional[str] = None


class IssueUpdate(BaseModel):
    project_key: Optional[str] = None
    issue_type: Optional[IssueTypeEnum] = None
    summary: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    priority: Optional[PriorityEnum] = None
    status: Optional[StatusEnum] = None
    assignee_username: Optional[str] = None
    component_name: Optional[str] = None
    version_name: Optional[str] = None
    original_estimate: Optional[float] = None
    remaining_estimate: Optional[float] = None
    due_date: Optional[date] = None
    label_names: Optional[List[str]] = None


class IssueResponse(IssueBase):
    issue_id: int
    issue_key: str
    status: StatusEnum
    reporter_username: str
    reporter_display_name: str
    time_spent: float
    created_at: datetime
    updated_at: datetime
    recommendation: Optional[dict] = None

    class Config:
        from_attributes = True


class IssueDetailResponse(IssueResponse):
    epic_issue_id: Optional[int] = None
    epic_issue_key: Optional[str] = None
    epic_issue_summary: Optional[str] = None
    resolution: Optional[str] = None
    component_description: Optional[str] = None
    version_released: Optional[bool] = None


# Comment schemas
class CommentBase(BaseModel):
    body: str


class CommentCreate(CommentBase):
    pass


class CommentResponse(CommentBase):
    comment_id: int
    issue_id: int
    user_id: int
    username: str
    display_name: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CommentUpdate(BaseModel):
    body: str


# Attachment schemas
class AttachmentResponse(BaseModel):
    attachment_id: int
    filename: str
    file_size: int
    mime_type: str
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


# Worklog schemas
class WorklogBase(BaseModel):
    time_spent: float  # hours
    comment: Optional[str] = None
    started_at: datetime


class WorklogCreate(WorklogBase):
    """A work entry, plus what it should do to the remaining estimate.

    Mirrors the choices Jira offers on its log-work dialog: reduce the remaining
    estimate automatically, leave it alone, set it to a value, or reduce it by a
    specific amount.
    """

    remaining_adjustment: Literal["auto", "leave", "set", "reduce"] = "auto"
    remaining_value: Optional[float] = Field(default=None, ge=0)


class WorklogUpdate(BaseModel):
    time_spent: Optional[float] = None
    comment: Optional[str] = None
    started_at: Optional[datetime] = None


class WorklogResponse(WorklogBase):
    worklog_id: int
    issue_id: int
    user_id: int
    username: str
    display_name: str
    time_spent_seconds: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Board schemas
class BoardBase(BaseModel):
    project_key: str
    name: str
    description: Optional[str] = None
    board_type: BoardTypeEnum


class BoardCreate(BoardBase):
    pass


class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class BoardResponse(BoardBase):
    board_id: int
    project_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BoardColumnBase(BaseModel):
    name: str
    column_type: str = "status"
    mapped_status_name: Optional[str] = None
    sort_order: int
    is_editable: bool = True


class BoardColumnCreate(BoardColumnBase):
    pass


class BoardColumnResponse(BoardColumnBase):
    column_id: int
    board_id: int
    status_name: Optional[str] = None
    status_color: Optional[str] = None

    class Config:
        from_attributes = True


# Sprint schemas
class SprintBase(BaseModel):
    board_id: int
    name: str
    goal: Optional[str] = None
    start_date: date
    end_date: date


class SprintCreate(SprintBase):
    pass


class SprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    sprint_status: Optional[str] = None  # future, active, closed
    is_completed: Optional[bool] = None


class SprintResponse(SprintBase):
    sprint_id: int
    sprint_status: str
    is_completed: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Label schemas
class LabelBase(BaseModel):
    name: str
    color_hex: Optional[str] = None


class LabelCreate(LabelBase):
    pass


class LabelUpdate(BaseModel):
    name: Optional[str] = None
    color_hex: Optional[str] = None


class LabelResponse(LabelBase):
    label_id: int

    class Config:
        from_attributes = True


# Issue Link schemas
class IssueLinkBase(BaseModel):
    issue_key_to: str
    link_type: str = "relates to"  # blocks, is blocked by, duplicates, is duplicated by, relates to, parent-child


class IssueLinkCreate(IssueLinkBase):
    pass


class IssueLinkResponse(BaseModel):
    link_id: int
    issue_key_from: str
    issue_key_to: str
    link_type: str
    issue_summary_to: Optional[str] = None

    class Config:
        from_attributes = True


class IssueEpicUpdate(BaseModel):
    epic_issue_key: Optional[str] = None


# Common response schemas
class MessageResponse(BaseModel):
    message: str


class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List


class PRCreate(BaseModel):
    pr_number: int
    repository_url: str
    branch_name: Optional[str] = None


class AgentStatusResponse(BaseModel):
    nim_available: bool
    selected_model: Optional[str]
    available_models: List[str]
    mode: str
    langchain_available: bool = False
    ai_planner_available: bool = False


class AgentActionResponse(BaseModel):
    id: int
    action_type: str
    title: str
    status: str


class AgentWorkflowResponse(BaseModel):
    output: dict[str, Any]
    pending_actions: List[AgentActionResponse]
    error: Optional[str] = None
