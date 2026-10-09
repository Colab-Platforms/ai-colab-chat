"""
Parses the `[Emotion: <name>, Intensity: <0-100>%]` tag the LLM is prompted to
emit at the start of each turn, strips it from the spoken text, and maps it to
ElevenLabs voice-setting deltas so delivery actually changes with the tag
instead of the tag just being decorative text read aloud.
"""

import re
from dataclasses import dataclass

EMOTION_TAG_RE = re.compile(
    r"^\s*\[Emotion:\s*(?P<name>\w+)\s*,\s*Intensity:\s*(?P<intensity>\d{1,3})%\]\s*",
    re.IGNORECASE,
)

# (stability, style) - lower stability = more expressive/variable delivery,
# higher style = more exaggerated emotional emphasis. Baseline neutral is (0.5, 0.3).
_EMOTION_VOICE_SETTINGS = {
    "happy": (0.35, 0.55),
    "excited": (0.25, 0.7),
    "sad": (0.55, 0.4),
    "thinking": (0.6, 0.2),
    "laughing": (0.3, 0.6),
    "surprised": (0.3, 0.6),
    "neutral": (0.5, 0.3),
}

DEFAULT_STABILITY, DEFAULT_STYLE = _EMOTION_VOICE_SETTINGS["neutral"]


@dataclass
class EmotionCue:
    name: str
    intensity: float  # 0.0 - 1.0
    stability: float
    style: float


def extract_emotion(text: str) -> tuple[str, EmotionCue]:
    """Strip the leading emotion tag (if present) and return (clean_text, cue)."""
    match = EMOTION_TAG_RE.match(text)
    if not match:
        return text, EmotionCue("neutral", 0.5, DEFAULT_STABILITY, DEFAULT_STYLE)

    name = match.group("name").lower()
    intensity = min(100, max(0, int(match.group("intensity")))) / 100.0
    stability, style = _EMOTION_VOICE_SETTINGS.get(name, (DEFAULT_STABILITY, DEFAULT_STYLE))

    # Scale the neutral baseline toward the emotion's target by intensity,
    # so a 20%-intensity tag barely shifts delivery and 100% fully applies it.
    stability = DEFAULT_STABILITY + (stability - DEFAULT_STABILITY) * intensity
    style = DEFAULT_STYLE + (style - DEFAULT_STYLE) * intensity

    clean_text = text[match.end():]
    return clean_text, EmotionCue(name, intensity, stability, style)
