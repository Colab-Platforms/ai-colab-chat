"""
Session broker for the voice agent.

The Node backend (never the browser directly) calls POST /session on behalf
of an already-authenticated user, using INTERNAL_SERVICE_TOKEN as a shared
secret. This service then:
  1. Creates a short-lived Daily.co room + token.
  2. Spawns a bot process that joins that room and runs the Pipecat pipeline.
  3. Returns the room URL + token so the Node backend can hand them to the
     frontend, which joins with @pipecat-ai/client-js.

Keeping this behind the Node backend (rather than exposing it to the browser)
means auth, rate limiting, and plan/usage checks stay centralized where the
rest of the product already enforces them.
"""

import multiprocessing
import time
import uuid

import aiohttp
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.bot import run_bot
from src.config import settings

app = FastAPI(title="Personal AI Agent — Voice Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

_ROOM_TTL_SECONDS = 30 * 60


def _run_bot_process(room_url: str, token: str, voice_id: str | None, chat_id: int):
    import asyncio

    asyncio.run(run_bot(room_url, token, voice_id, chat_id))


class SessionRequest(BaseModel):
    userId: int
    voiceId: str | None = None
    chatId: int


class SessionResponse(BaseModel):
    roomUrl: str
    token: str


async def _create_daily_room() -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{settings.daily_api_url}/rooms",
            headers={"Authorization": f"Bearer {settings.daily_api_key}"},
            json={
                "name": f"voice-{uuid.uuid4().hex[:12]}",
                "properties": {
                    "exp": int(time.time()) + _ROOM_TTL_SECONDS,
                    "enable_chat": False,
                    "start_video_off": True,
                    "start_audio_off": False,
                },
            },
        ) as resp:
            resp.raise_for_status()
            return await resp.json()


async def _create_daily_token(room_name: str) -> str:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{settings.daily_api_url}/meeting-tokens",
            headers={"Authorization": f"Bearer {settings.daily_api_key}"},
            json={
                "properties": {
                    "room_name": room_name,
                    "exp": int(time.time()) + _ROOM_TTL_SECONDS,
                    "is_owner": False,
                }
            },
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return data["token"]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/session", response_model=SessionResponse)
async def create_session(
    body: SessionRequest,
    x_internal_token: str = Header(default=""),
):
    if not settings.internal_service_token or x_internal_token != settings.internal_service_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    room = await _create_daily_room()
    bot_token = await _create_daily_token(room["name"])
    client_token = await _create_daily_token(room["name"])

    process = multiprocessing.Process(
        target=_run_bot_process,
        args=(room["url"], bot_token, body.voiceId, body.chatId),
        daemon=True,
    )
    process.start()

    return SessionResponse(roomUrl=room["url"], token=client_token)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=settings.port, reload=True)
