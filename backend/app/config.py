from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Application settings"""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8")

    # Database
    database_server: str

    # JWT
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int

    # CORS
    frontend_url: str

    # NVIDIA NIM / OpenAI-compatible inference endpoint
    nim_base_url: Optional[str] = None
    nim_api_key: Optional[str] = None
    nvidia_api_key: Optional[str] = None
    nim_model: Optional[str] = None
    nim_embedding_model: Optional[str] = None

    # SMTP / Gmail automation
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_sender_email: Optional[str] = None
    smtp_use_tls: bool = False

    # Model Context Protocol (MCP)
    mcp_api_token: Optional[str] = None

settings = Settings()
