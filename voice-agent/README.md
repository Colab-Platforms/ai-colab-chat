# Voice Agent (Phase 1)

Python microservice, sibling to `backend/` and `frontend/`, that runs the
real-time conversational voice pipeline using [Pipecat](https://www.pipecat.ai/).
Scope: natural voice conversation with emotion-aware delivery and selectable
voices/accents. No tool calling, no document generation, no integrations yet
— that's Phase 2/3.

## Why a separate service

The main app is Node/TS/Express. Pipecat's pipeline runtime is Python-only.
This service owns real-time audio orchestration (STT → LLM → TTS,
interruption handling, emotion delivery); the Node backend keeps owning auth,
chat persistence, and usage metering. The two only talk over one small HTTP
call — see [Integration](#integration-with-the-node-backend).

## Layout

```
voice-agent/
├── server.py          # FastAPI: mints a Daily room + spawns a bot per session
├── src/
│   ├── bot.py          # The actual Pipecat pipeline (STT/LLM/TTS/emotion)
│   ├── config.py        # env-driven settings
│   └── emotion.py       # [Emotion: X, Intensity: Y%] tag parsing -> TTS params
├── requirements.txt
└── .env.example
```

## Setup

```bash
cd voice-agent
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env          # fill in Daily / Deepgram / OpenRouter / ElevenLabs keys
python server.py
```

Runs on `http://localhost:7860` by default.

## Integration with the Node backend

The browser never talks to this service directly. Flow:

1. Frontend clicks "Conversation AI" → calls the existing Node backend
   (`POST /api/voice/session`, authenticated the normal way).
2. Node backend calls `POST http://voice-agent:7860/session` with
   `X-Internal-Token: <INTERNAL_SERVICE_TOKEN>` and `{ userId, voiceId }`.
3. This service creates a short-lived Daily room, spawns a bot process that
   joins it, and returns `{ roomUrl, token }`.
4. Node backend relays that to the frontend, which joins the room with
   `@pipecat-ai/client-js` / `@pipecat-ai/client-react`. Audio from that
   point on flows browser ⇄ Daily ⇄ this service directly (not through Node).

`INTERNAL_SERVICE_TOKEN` must match between this service's `.env` and the
Node backend's `.env` — treat it like any other service credential, not a
user-facing secret.

## Required accounts

| Provider | Used for | Env var |
|---|---|---|
| Daily.co | WebRTC transport/rooms | `DAILY_API_KEY` |
| Deepgram | Streaming STT | `DEEPGRAM_API_KEY` |
| OpenRouter | LLM (same account the Node backend uses) | `OPENROUTER_API_KEY` |
| ElevenLabs | Streaming, emotion-expressive TTS | `ELEVENLABS_API_KEY` |

## Notes

- `emotion.py` expects the LLM to prefix every reply with
  `[Emotion: Happy, Intensity: 80%]`. The voice system prompt in `bot.py`
  enforces this; if you change models, re-check the tag still comes through
  reliably before shipping.
- One bot process per active call (`multiprocessing.Process` in `server.py`).
  Fine for initial rollout; move to a proper worker pool before high
  concurrency.
- No wallet/usage metering yet — same known gap flagged for document
  generation (voice-minutes don't fit the token-based UsageLog schema
  either). Needs a product decision before this goes further than an
  internal demo.
