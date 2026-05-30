from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

# Editorial / pedagogy constants (WORDS_PER_PAGE, FONT_SIZES, grade-to-band,
# etc.) live in app/pedagogy.py — keep them out of here so config.py stays
# the home for env-driven runtime settings only.

MAX_RETRIES = 3
EVALUATOR_TRANSPORT_RETRIES = 3


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    anthropic_api_key: str = ""
    google_api_key: str = ""
    openai_api_key: str = ""  # reserved for v2; not used in v1
    claude_model: str = "claude-sonnet-4-6"
    gemini_model: str = "gemini-2.5-pro"
    evaluator_prompt_version: str = "v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
