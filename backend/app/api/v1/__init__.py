from fastapi import APIRouter
from app.api.v1 import (
    agents,
    analytics,
    audit,
    auth,
    boards,
    bulk,
    dashboards,
    filters,
    issues,
    notifications,
    permissions,
    projects,
    roadmaps,
    tasks,
    templates,
    users,
    webhooks,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)
api_router.include_router(issues.router)
api_router.include_router(boards.router)
api_router.include_router(agents.router)
api_router.include_router(filters.router)
api_router.include_router(webhooks.router)
api_router.include_router(templates.router)
api_router.include_router(dashboards.router)
api_router.include_router(bulk.router)
api_router.include_router(permissions.router)
api_router.include_router(notifications.router)
api_router.include_router(roadmaps.router)
api_router.include_router(audit.router)
api_router.include_router(tasks.router)
api_router.include_router(analytics.router)
