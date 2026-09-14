from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base, create_database_if_not_exists, seed_reference_data
from app.api.v1 import api_router
from app.auth import get_password_hash
from app.middleware.rate_limit import RateLimitMiddleware
from app.mcp_server import create_mcp_asgi_app, mcp_server


_mcp_session_manager_context = None

app = FastAPI(
    title="ZYRAA API",
    description="A project management and issue tracking system",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Mcp-Session-Id"],
)

app.add_middleware(RateLimitMiddleware, requests_per_minute=120, window_seconds=60)

# Include API routes
app.include_router(api_router)
app.mount("/mcp", create_mcp_asgi_app())


@app.on_event("startup")
def on_startup():
    """Initialize the database schema when the application starts."""
    # Create the database if it doesn't exist
    create_database_if_not_exists()
    
    # Import models here to ensure metadata is populated before creating tables.
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    seed_reference_data()


@app.on_event("startup")
async def start_mcp_session_manager():
    global _mcp_session_manager_context
    _mcp_session_manager_context = mcp_server.session_manager.run()
    await _mcp_session_manager_context.__aenter__()


@app.on_event("shutdown")
async def stop_mcp_session_manager():
    global _mcp_session_manager_context
    if _mcp_session_manager_context is not None:
        await _mcp_session_manager_context.__aexit__(None, None, None)
        _mcp_session_manager_context = None


@app.get("/")
def read_root():
    """Root endpoint"""
    return {
        "name": "ZYRAA API",
        "version": "1.0.0",
        "status": "running",
        "documentation": "/docs",
        "openapi": "/openapi.json"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
