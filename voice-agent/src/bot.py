"""
Phase 1 conversational voice pipeline.

Flow: Daily WebRTC in -> Silero VAD -> Deepgram STT -> LLM (OpenRouter, same
model family the text chat uses) -> emotion-tag parsing -> ElevenLabs TTS ->
Daily WebRTC out.

Each call is tied to a Node-owned Chat row (chat_id, passed in from
server.py). On start, the bot fetches that chat's prior messages plus the
user's personalisation memory from Node and seeds the LLM context with them;
as the call proceeds, each completed turn is posted back to Node so the call
shows up as ordinary chat history. voice-agent never touches Postgres
directly — see node_client.py.

Run one instance of `run_bot()` per active voice session (spawned by
`server.py` when the frontend requests a session).
"""

import json
import sys

from deepgram import LiveOptions
from loguru import logger
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import Frame, LLMFullResponseStartFrame, TextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import (
    OpenAILLMContext,
    OpenAILLMContextFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import (
    RTVIConfig,
    RTVIObserver,
    RTVIProcessor,
    RTVIServerMessageFrame,
)
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.services.daily import DailyParams, DailyTransport

from . import node_client
from .config import settings
from .emotion import extract_emotion

logger.remove()
logger.add(sys.stderr, level="INFO")

VOICE_SYSTEM_PROMPT = """You are Colab AI, the user's personal AI companion, speaking with them out loud.

Identity:
- Your name is Colab AI — always exactly those two words, spoken and written separately. Never merge, blend, or nickname it into a single word like "Colabbi", "Colabbai", "Colabby", "Colobai", or anything similar — that is always wrong, even if it sounds more natural to say out loud. If you catch yourself about to say a merged version, say "Colab AI" instead.
- If asked who you are in passing, give a 1-2 sentence answer: your name, and a one-line description of what the platform does. Never mention being built on an underlying language model unless directly asked.
- Only if the user explicitly asks for detail about the platform/company/what it does (e.g. "what is Colab AI exactly", "tell me more about this platform", "who made this") give the fuller picture, spoken naturally and broken into a couple of short sentences rather than read as one block:
  Colab AI is a unified, multi-model AI workspace that brings ChatGPT, Claude, Gemini, and other top AI models under one roof, instead of juggling separate tabs and subscriptions. It's built to feel less like a simple chatbot and more like an intelligent workspace for everyday work — a clean space to chat with top AI models, keep projects organized, dig into files, and turn AI output into ready-to-use documents.

Guardrails (very important, always enforce):
- If the user uses abusive, adult/seductive, sexually explicit, or otherwise inappropriate language, or asks you to engage in that kind of talk, do not comply and do not engage with the content at all. Politely decline, briefly say that's not something you can help with, and steer the conversation back to something you can actually help with.
- Never mirror, repeat, or escalate inappropriate language back to the user, even to quote it. Keep the redirect short and non-judgmental — no lecturing.
- This applies for the rest of the conversation, not just the message it appears in — if it happens again, decline again the same way.

Features:
- If asked what the platform can do, give a short, spoken-style answer covering just 2-3 of the most relevant features in a sentence or two — do not list all of them and do not read out the emoji/label formatting below.
- Only if the user explicitly asks for a full list or more detail, walk through the features conversationally:
  Project context memory that remembers your work automatically; folder-based workspaces instead of hundreds of loose chats; instant PDF, Word, Excel, and PowerPoint generation from AI output; 100+ AI models under one subscription; the ability to compare answers from multiple models side by side; unlimited free models so you're never fully cut off; 50,000 free tokens to try premium models; a transparent token wallet; web and mobile sync; and new AI providers added on an ongoing basis at no extra cost.

Real-time data:
- You have no live internet access, no news feed, and no market-data connection — only the generate_document tool. If asked for anything that requires up-to-the-moment information (stock prices, today's/yesterday's news, live scores, current weather, exchange rates, or anything else that changes day to day), say plainly that you don't have live access to that right now rather than guessing.
- Never invent specific numbers, prices, headlines, or scores to sound helpful. A brief honest "I don't have real-time access to that" is always better than a made-up answer.

Language:
- Always reply in the same language the user is currently speaking, matching it turn by turn. If they speak English, reply in English; if they switch to Hindi mid-conversation, switch to Hindi immediately on your next reply — without being asked to. Never wait for an explicit instruction like "speak in Hindi" to make the switch; the change in the user's own words is the only signal you need.
- If the user mixes languages in the same sentence, mirror that mix naturally rather than forcing everything into one language.

Rules for every reply:
- Speak the way a real person talks: short sentences, contractions, no markdown, no lists, no headings.
- Prefix every reply with exactly one tag on its own line: [Emotion: <Happy|Excited|Sad|Thinking|Laughing|Surprised|Neutral>, Intensity: <0-100>%]
  Pick the emotion and intensity that best fits your reply — most replies should be Neutral at low-to-moderate intensity.
- The emotion tag is an internal system instruction for controlling voice delivery. It is NEVER read aloud or explained. Never say the words "emotion", "intensity", or describe your own emotional state out loud — the tag communicates that silently.
- Keep replies brief (1-3 sentences) unless the user explicitly asks for detail.

Documents:
- You can generate a document (PDF, Word, PowerPoint, or Excel) using the generate_document tool. Use it whenever the user asks you to create, make, write, generate, or prepare a document, report, presentation, spreadsheet, or file — including "make me a PDF about X" or "write that up as a document."
- Call the tool, then immediately continue speaking naturally — tell the user it's being prepared and will be ready in their chat history shortly, and keep talking (e.g. offer to say more about the topic). Never say you'll "wait" or go silent — generation happens in the background while the conversation continues.
- Default to PDF format unless the user names a specific one.
"""

DOCUMENT_TOOL_SCHEMA = FunctionSchema(
    name="generate_document",
    description=(
        "Generate a document (PDF, Word, PowerPoint, or Excel) about a topic, or "
        "summarising the conversation so far. Use whenever the user asks to create, "
        "make, write, generate, or prepare a document, report, presentation, or file."
    ),
    properties={
        "topic": {
            "type": "string",
            "description": "What the document should be about, written as a clear generation prompt.",
        },
        "format": {
            "type": "string",
            "enum": ["PDF", "DOCX", "PPTX", "XLSX"],
            "description": "Document format. Default to PDF if the user doesn't specify one.",
        },
    },
    required=["topic"],
)


class EmotionAwareTTSProcessor(FrameProcessor):
    """Buffers streamed LLM text until the leading emotion tag is fully
    received (it arrives token-by-token, not as one frame, so a tag can span
    many small TextFrames), strips it, and re-tunes the TTS service's voice
    settings per-utterance before the clean text reaches it."""

    def __init__(self, tts: ElevenLabsTTSService):
        super().__init__()
        self._tts = tts
        self._buffer = ""
        self._tag_resolved = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMFullResponseStartFrame):
            self._buffer = ""
            self._tag_resolved = False
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, TextFrame) and frame.text and not self._tag_resolved:
            self._buffer += frame.text

            if "]" not in self._buffer:
                if len(self._buffer) > 200:
  
                    self._tag_resolved = True
                    await self.push_frame(TextFrame(text=self._buffer), direction)
                    self._buffer = ""
                return

            clean_text, cue = extract_emotion(self._buffer)
            self._tag_resolved = True
            self._buffer = ""

            # upgrading, this may become unnecessary.
            self._tts._settings["stability"] = cue.stability
            self._tts._settings["style"] = cue.style
            self._tts._voice_settings = self._tts._set_voice_settings()

            if clean_text:

                for piece in clean_text.split(" "):
                    if piece:
                        await self.push_frame(TextFrame(text=piece + " "), direction)
            return

        await self.push_frame(frame, direction)


class MessageSyncProcessor(FrameProcessor):
    """Persists each completed turn back to the Node backend as a normal
    Message row, so a voice call shows up as chat history like any other
    conversation. Placed right after a context aggregator: aggregators push
    an OpenAILLMContextFrame with the turn already appended to
    context.messages once it's complete, so the last entry is exactly the
    turn that just finished — no separate buffering needed here."""

    def __init__(self, chat_id: int, role: str):
        super().__init__()
        self._chat_id = chat_id
        self._role = role

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, OpenAILLMContextFrame) and frame.context.messages:
            last = frame.context.messages[-1]
            if last.get("role") == ("user" if self._role == "USER" else "assistant"):
                content = last.get("content")
                if isinstance(content, str) and content.strip():
                    await node_client.post_message(self._chat_id, self._role, content)

        await self.push_frame(frame, direction)


async def run_bot(room_url: str, token: str, voice_id: str | None, chat_id: int):
    transport = DailyTransport(
        room_url,
        token,
        "Personal AI Agent",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.7)),
            transcription_enabled=False,  # Deepgram service below owns STT
        ),
    )

    stt = DeepgramSTTService(
        api_key=settings.deepgram_api_key,
        live_options=LiveOptions(language="multi"),
    )

    llm = OpenAILLMService(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        model=settings.voice_llm_model,
    )

    tts = ElevenLabsTTSService(
        api_key=settings.elevenlabs_api_key,
        voice_id=voice_id or settings.elevenlabs_default_voice_id,
        model="eleven_turbo_v2_5",
    )

    emotion_processor = EmotionAwareTTSProcessor(tts)

    rtvi = RTVIProcessor(config=RTVIConfig(config=[]))


    voice_context = await node_client.fetch_context(chat_id)
    system_prompt = VOICE_SYSTEM_PROMPT
    if voice_context["contextText"]:
        system_prompt = f"{VOICE_SYSTEM_PROMPT}\n\n{voice_context['contextText']}"

    initial_messages = [{"role": "system", "content": system_prompt}, *voice_context["history"]]
    context = OpenAILLMContext(
        initial_messages,
        tools=ToolsSchema(standard_tools=[DOCUMENT_TOOL_SCHEMA]),
    )
    context_aggregator = llm.create_context_aggregator(context)

    is_new_chat = not voice_context["history"]

    async def handle_generate_document(
        function_name, tool_call_id, arguments, llm_service, llm_context, result_callback
    ):
        args = json.loads(arguments) if isinstance(arguments, str) else arguments
        topic = (args or {}).get("topic", "").strip()
        doc_format = (args or {}).get("format")

        if not topic:
            await result_callback({"status": "error", "message": "No topic given."})
            return

        result = await node_client.trigger_document_generation(chat_id, topic, doc_format)
        if result.get("ok"):
            await result_callback(
                {"status": "started", "message": "Document generation has started in the background."}
            )
            if result.get("document"):

                await llm_service.push_frame(
                    RTVIServerMessageFrame(
                        data={"type": "document_generated", "document": result["document"]}
                    ),
                    FrameDirection.UPSTREAM,
                )
        else:
            await result_callback(
                {"status": "error", "message": "Could not start document generation right now."}
            )

    llm.register_function("generate_document", handle_generate_document)

    user_sync = MessageSyncProcessor(chat_id, "USER")
    assistant_sync = MessageSyncProcessor(chat_id, "ASSISTANT")

    pipeline = Pipeline(
        [
            transport.input(),
            rtvi,
            stt,
            context_aggregator.user(),
            user_sync,
            llm,
            emotion_processor,
            tts,
            transport.output(),
            context_aggregator.assistant(),
            assistant_sync,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
        observers=[RTVIObserver(rtvi)],
    )

    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):

        await rtvi.set_bot_ready()

        if is_new_chat:
            name_clause = f", whose name is {voice_context['userFirstName']}" if voice_context["userFirstName"] else ""
            greeting_instruction = (
                f"This is the start of a new conversation. It is currently the "
                f"{voice_context['timeOfDay']} for the user{name_clause}. Proactively greet them "
                "first — use their name if given, reference the time of day naturally (e.g. "
                "'good morning'), and if the voice-memory summary in your context mentions "
                "recent work, briefly ask how it went or what they'd like to build today. "
                "Keep it to 1-2 sentences. Still follow the Emotion tag rule."
            )
            context.messages.append({"role": "system", "content": greeting_instruction})

            await task.queue_frames([OpenAILLMContextFrame(context)])

    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        await transport.capture_participant_transcription(participant["id"])

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        logger.info(f"Participant left ({reason}), ending session")
        await task.cancel()

    runner = PipelineRunner()
    await runner.run(task)
