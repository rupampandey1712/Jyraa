import json
from typing import AsyncGenerator, Optional

from app.config import settings

try:
    from langchain_nvidia_ai_endpoints import ChatNVIDIA
except ImportError:  # pragma: no cover - optional dependency fallback
    ChatNVIDIA = None

try:
    import httpx
except ImportError:  # pragma: no cover - optional dependency fallback
    httpx = None


def _nim_base_url() -> str:
    return (settings.nim_base_url or "").rstrip("/")


def _nim_api_key() -> Optional[str]:
    return settings.nim_api_key or settings.nvidia_api_key


def _nim_model() -> Optional[str]:
    return settings.nim_model


def nim_is_configured() -> bool:
    return bool(_nim_api_key() and _nim_model() and ChatNVIDIA is not None)


def langchain_nvidia_available() -> bool:
    return ChatNVIDIA is not None


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    api_key = _nim_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def get_available_models(timeout: float = 3.0) -> list[str]:
    base_url = _nim_base_url()
    if not _nim_api_key() or not base_url or httpx is None:
        return []

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.get(f"{base_url}/models", headers=_headers())
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, json.JSONDecodeError):
        return []

    models = []
    for item in data.get("data", []):
        model_id = item.get("id")
        if model_id:
            models.append(model_id)
    return models


def choose_best_model(preferred: list[str] | None = None) -> Optional[str]:
    configured = _nim_model()
    if not _nim_api_key() or not configured or ChatNVIDIA is None:
        return None

    if not preferred:
        return configured

    available = get_available_models()
    if not available:
        return configured

    for model in preferred:
        if model in available:
            return model
    return configured


def choose_best_embedding_model() -> Optional[str]:
    return settings.nim_embedding_model if _nim_api_key() and settings.nim_embedding_model else None


def _build_chat_client(*, temperature: float = 1.0, top_p: float = 1.0, max_completion_tokens: int = 16384):
    model = choose_best_model()
    api_key = _nim_api_key()
    if not model or ChatNVIDIA is None or not api_key:
        return None
    return ChatNVIDIA(
        model=model,
        api_key=api_key,
        temperature=temperature,
        top_p=top_p,
        max_completion_tokens=max_completion_tokens,
    )


def _messages(prompt: str, system: str) -> list[dict[str, str]]:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return messages


def _content_of(response) -> str:
    """The assistant's text, wherever the model put it.

    Reasoning models served through NIM can return an empty ``content`` and place
    the answer in ``reasoning_content`` instead. Reading only ``content`` makes
    those models look like they returned nothing.
    """
    content = getattr(response, "content", "") or ""
    if isinstance(content, list):  # Some providers return content parts.
        content = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in content)
    if content:
        return str(content)

    for bag in (getattr(response, "additional_kwargs", None), getattr(response, "response_metadata", None)):
        if isinstance(bag, dict):
            reasoning = bag.get("reasoning_content")
            if reasoning:
                return str(reasoning)
    return ""


async def generate_response(prompt: str, system: str) -> tuple[str, Optional[str]]:
    model = choose_best_model()
    client = _build_chat_client()
    if not model or client is None:
        return (
            "NIM LangChain integration is not configured. The system is running in deterministic fallback mode.",
            None,
        )

    try:
        response = await client.ainvoke(_messages(prompt, system))
        return _content_of(response), model
    except Exception:
        return (
            "NIM model could not be reached through LangChain. Returning deterministic results only.",
            None,
        )


async def generate_response_stream(prompt: str, system: str) -> AsyncGenerator[str, None]:
    model = choose_best_model()
    client = _build_chat_client()
    if not model or client is None:
        yield "NIM LangChain integration is not configured. No model is available."
        return

    try:
        async for chunk in client.astream(_messages(prompt, system)):
            content = getattr(chunk, "content", "")
            if content:
                yield str(content)
    except Exception:
        yield "NIM LangChain stream failed. Falling back to deterministic summary."
