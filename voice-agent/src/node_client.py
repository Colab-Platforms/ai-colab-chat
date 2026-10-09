"""
Thin client for the calls the bot makes back into the Node backend: fetching
a chat's prior history + personalisation memory at call start, persisting
each completed turn as it happens, and triggering document generation when
the LLM calls the generate_document tool. Node owns all chat/message/document
persistence — this service never touches Postgres directly.
"""

import aiohttp
from loguru import logger

from .config import settings


_EMPTY_CONTEXT = {
    "history": [],
    "contextText": "",
    "userFirstName": None,
    "timeOfDay": "day",
}


async def fetch_context(chat_id: int) -> dict:
    """Returns {"history": [...], "contextText": str, "userFirstName": str|None,
    "timeOfDay": "morning"|"afternoon"|"evening"|"night"}. Falls back to an
    empty context on any failure so a Node hiccup doesn't prevent the call
    from starting — it just starts without memory or a personalised greeting
    that turn."""
    url = f"{settings.node_backend_url}/voice/internal/context/{chat_id}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                headers={"X-Internal-Token": settings.internal_service_token},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                resp.raise_for_status()
                body = await resp.json()
                return {**_EMPTY_CONTEXT, **(body.get("data") or {})}
    except Exception as e:
        logger.warning(f"Failed to fetch voice chat context for chat {chat_id}: {e}")
        return dict(_EMPTY_CONTEXT)


async def post_message(chat_id: int, role: str, content: str) -> None:
    """Fire-and-forget persist of one completed turn. Logged, not raised, so a
    transient Node outage doesn't crash the live call."""
    if not content.strip():
        return

    url = f"{settings.node_backend_url}/voice/internal/messages"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                headers={"X-Internal-Token": settings.internal_service_token},
                json={"chatId": chat_id, "role": role, "content": content},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                resp.raise_for_status()
    except Exception as e:
        logger.warning(f"Failed to persist voice message for chat {chat_id}: {e}")


async def trigger_document_generation(chat_id: int, prompt: str, format: str | None) -> dict:
    """Enqueues a document via the same path text-chat uses (document.service.ts's
    DocumentService.create — PENDING row + immediate worker kick). Returns
    quickly regardless of render time; the LLM's tool-result callback uses
    this to keep the conversation going while it renders in the background."""
    url = f"{settings.node_backend_url}/voice/internal/documents"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                headers={"X-Internal-Token": settings.internal_service_token},
                json={"chatId": chat_id, "prompt": prompt, "format": format},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                body = await resp.json()
                return {"ok": True, "document": body.get("data")}
    except Exception as e:
        logger.warning(f"Failed to trigger document generation for chat {chat_id}: {e}")
        return {"ok": False}
