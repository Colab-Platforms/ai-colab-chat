from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Transport
    daily_api_key: str
    daily_api_url: str = "https://api.daily.co/v1"

    # STT
    deepgram_api_key: str

    # LLM
    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    voice_llm_model: str = "anthropic/claude-haiku-4.5"

    # TTS
    elevenlabs_api_key: str
    elevenlabs_default_voice_id: str

    # Service
    port: int = 7860
    frontend_url: str = "http://localhost:3000"
    internal_service_token: str = ""

    # Node backend (chat history / memory context, and where completed turns
    # get persisted back to) — reachable from inside the Docker container.
    node_backend_url: str = "http://host.docker.internal:5000/api"


settings = Settings()
