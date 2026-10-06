# Voice Agent - Architecture & Flow Reference

Phase 1 of the Personal AI Agent roadmap: real-time, emotion-aware voice
conversation, surfaced as a "Conversation AI" button in the chat composer.
This document explains how the pieces fit together and communicate - for
your own reference, not user-facing.

---

## 1. Why three services instead of two

| Service | Language | Owns |
|---|---|---|
| `frontend/` | Next.js/React | UI, including the blob voice modal |
| `backend/` | Node/Express | Auth, chat persistence, usage metering, and now: brokering voice sessions |
| `voice-agent/` | Python | Real-time audio pipeline (STT → LLM → TTS, interruption handling, emotion) |

The main app is Node. **Pipecat - the framework doing the actual voice
orchestration (voice activity detection, streaming STT/TTS, turn-taking,
interruptions) - is Python-only.** There's no JS equivalent with the same
maturity, so rather than reimplementing that orchestration logic in Node,
Phase 1 adds a third service that owns only real-time audio, and talks to
the Node backend over one small HTTP call per session.

---

## 2. The four external platforms, and what each one actually does

Every voice turn passes through all four. None of them talk to each other
directly - `voice-agent` is the orchestrator wiring them together.

```
User's mic
   │
   ▼
┌─────────────┐   raw audio frames over WebRTC
│   Daily.co   │──────────────────────────────────┐
└─────────────┘                                    │
   (transport only - moves audio in/out of         ▼
    the browser, doesn't understand it)      ┌──────────────┐
                                              │   Deepgram   │  audio → text
                                              │    (STT)     │  (streaming, low latency)
                                              └──────┬───────┘
                                                      │ transcript
                                                      ▼
                                              ┌──────────────┐
                                              │  OpenRouter  │  text → reply text
                                              │    (LLM)     │  (same account/models
                                              └──────┬───────┘   as the text chat)
                                                      │ reply + [Emotion: X, Y%] tag
                                                      ▼
                                              ┌──────────────┐
                                              │  ElevenLabs  │  text → speech audio
                                              │    (TTS)     │  (voice/accent, emotion
                                              └──────┬───────┘   -tuned delivery)
                                                      │ audio frames
                                                      ▼
                                              ┌─────────────┐
                                              │  Daily.co   │──────► User's speaker
                                              └─────────────┘
```

- **Daily.co - transport only.** It moves audio packets between the
  browser and `voice-agent` over WebRTC (handles network traversal,
  reconnects, jitter buffering). It has no idea what's being said - it's
  the "pipe," not a participant in the conversation.
- **Deepgram - ears.** Converts the user's speech to text, streaming
  (partial transcripts arrive as the user talks, not after they stop).
- **OpenRouter - brain.** Takes the transcript, generates a reply using
  the same model family/account the text chat already uses. Prompted
  (see §5) to keep replies short and to emit an emotion tag.
- **ElevenLabs - voice.** Converts the reply text to speech, streaming
  (audio starts playing before the whole sentence is synthesized). Voice
  ID and per-utterance stability/style settings determine the accent and
  emotional delivery.

None of these four have a relationship with each other or with your
Postgres database - `voice-agent` is the only thing that talks to all of
them, per active call.

---

## 3. Node ⇄ Python communication (the only cross-language boundary)

The browser **never** talks to `voice-agent` directly for anything except
the live WebRTC audio stream itself - session creation always goes through
Node first, so auth/usage stays centralized where the rest of the product
already enforces it.

```
┌─────────┐  1. click "Conversation AI"     ┌──────────┐
│ Browser │ ───────────────────────────────►│  Node    │
│(voice-  │                                  │ backend  │
│ modal)  │  POST /api/voice/session          │          │
└─────────┘  (normal JWT auth cookie/header)  └────┬─────┘
                                                     │
                                     2. POST /session
                                        X-Internal-Token: <shared secret>
                                        { userId, voiceId }
                                                     │
                                                     ▼
                                          ┌────────────────────┐
                                          │   voice-agent       │
                                          │   (Python/FastAPI)  │
                                          └─────────┬───────────┘
                                                     │ 3. calls Daily's
                                                     │    REST API:
                                                     │    - create room
                                                     │    - mint 2 tokens
                                                     │      (bot + client)
                                                     ▼
                                          ┌────────────────────┐
                                          │  spawns a bot       │
                                          │  process that joins │
                                          │  the room and runs  │
                                          │  the Pipecat         │
                                          │  pipeline (src/bot.py)│
                                          └─────────┬───────────┘
                                                     │
                                     4. returns { roomUrl, token }
                                        (the CLIENT token, not the bot's)
                                                     │
             ◄───────────────────────────────────────
             5. Node relays { roomUrl, token } to the browser
             │
             ▼
┌─────────┐  6. joins the Daily room directly using
│ Browser │     @pipecat-ai/client-js + @pipecat-ai/daily-transport
│         │─────────────────────────────────────────────────────►  Daily.co room
└─────────┘                                                         (bot is already
                                                                      in the room from
                                                                      step 3)
```

From step 6 onward, **audio flows browser ⇄ Daily ⇄ voice-agent directly**
- Node is out of the loop until the call ends. Node's only job was to
authenticate the user and hand out a room/token pair.

### Why the shared secret (`INTERNAL_SERVICE_TOKEN`)

`voice-agent`'s `/session` endpoint has no concept of your app's users -
it just knows "someone with the right secret asked for a room." The
`X-Internal-Token` header is that secret, checked in
`voice-agent/server.py`'s `create_session` handler. It must match between
`voice-agent/.env` (`INTERNAL_SERVICE_TOKEN`) and `backend/.env`
(`VOICE_AGENT_INTERNAL_TOKEN`) - same value, different variable names on
each side. This is what stops anyone who can reach `voice-agent` on the
network from minting rooms without going through Node's auth first.

### Code locations for this handshake

| Step | File |
|---|---|
| Browser → Node | `frontend/components/chat/voice-modal.tsx` (`voiceService.createSession()`) |
| Node route | `backend/src/modules/voice/voice.route.ts` → `voice.controller.ts` |
| Node → Python | `backend/src/modules/voice/voice.service.ts` (`fetch` to `VOICE_AGENT_URL`) |
| Python session broker | `voice-agent/server.py` (`POST /session`) |
| Python pipeline | `voice-agent/src/bot.py` (`run_bot`) |

---

## 4. What happens during the call itself (inside `voice-agent`)

Once the bot process joins the Daily room (`src/bot.py`), it builds a
Pipecat **pipeline** - a linear chain of processors each frame of
audio/text flows through in order:

```
Daily audio in
   → Silero VAD          (detects when the user starts/stops talking,
                           enables natural interruption - "barge-in")
   → Deepgram STT
   → conversation context (running message history for this call)
   → OpenRouter LLM
   → EmotionAwareTTSProcessor   (strips the [Emotion: ...] tag from the
                                  reply text, re-tunes ElevenLabs'
                                  stability/style params for this
                                  utterance - see src/emotion.py)
   → ElevenLabs TTS
   → Daily audio out
   → conversation context       (records the assistant's reply too)
```

Pipecat runs this as an async pipeline - frames stream through rather
than waiting for each stage to fully finish, which is what makes the
audio start playing before the LLM has finished generating the whole
reply.

### The emotion tag system

The system prompt in `bot.py` instructs the LLM to prefix every reply
with a tag like:

```
[Emotion: Happy, Intensity: 80%] That's amazing, congratulations!
```

`src/emotion.py` regex-matches that prefix, strips it before the text
reaches TTS (so it's never spoken aloud), and maps the emotion name +
intensity to ElevenLabs voice-setting deltas (lower "stability" = more
expressive/variable delivery, higher "style" = more exaggerated emphasis).
Intensity scales how far the settings move from neutral - a 20% tag barely
shifts delivery, 100% fully applies it.

---

## 5. Multi-voice / accent support

`ELEVENLABS_DEFAULT_VOICE_ID` in `voice-agent/.env` sets the fallback
voice. `POST /session` already accepts an optional `voiceId` - the
frontend can eventually let a user pick Male/Female/Indian/American/etc.
from ElevenLabs' voice library and pass that ID through
`voiceService.createSession(voiceId)` → Node → `voice-agent` → `bot.py`'s
`ElevenLabsTTSService(voice_id=...)`. Not built yet (no voice-picker UI),
but the plumbing already supports it - this was designed in from the
start rather than bolted on later.

---

## 6. Current status (be accurate with yourself here)

- ✅ All code scaffolded and type-checked (frontend `tsc`, backend
  `tsc`).
- ✅ All four provider accounts created, keys filled into
  `voice-agent/.env`.
- ⏳ **Not yet run end-to-end.** `daily-python` (Daily's native SDK) has
  no Windows wheels, so `voice-agent` runs in Docker (Linux container),
  currently being set up. Until a real call has been placed and audio
  has round-tripped, treat every piece of this document as "designed to
  work," not "verified to work."
- ❌ No wallet/usage metering for voice minutes yet (same schema gap
  flagged for document generation - token-based `UsageLog` doesn't fit
  either cost shape).
- ❌ No voice-picker UI (accent/gender selection) - backend/pipeline
  support the parameter, frontend doesn't expose it yet.

---

## 7. Local dev - running all three services together

```powershell
# Terminal 1 - voice-agent (Docker, since Daily's SDK has no Windows wheels)
cd voice-agent
docker build -t voice-agent .
docker run --env-file .env -p 7860:7860 voice-agent

# Terminal 2 - backend
cd backend
npm run dev

# Terminal 3 - frontend
cd frontend
npm run dev
```

Then open the chat UI, click the "Conversation AI" (audio-lines) icon in
the composer, and talk.
