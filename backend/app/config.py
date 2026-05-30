from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


WORDS_PER_PAGE: dict[tuple[str, bool], int] = {
    ("K", True):  20,  ("K", False):  40,
    ("1", True):  40,  ("1", False):  80,
    ("2", True):  70,  ("2", False): 140,
    ("3", True): 100,  ("3", False): 200,
    ("4", True): 150,  ("4", False): 300,
    ("5", True): 200,  ("5", False): 400,
}

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
