from app.config import MAX_RETRIES, EVALUATOR_TRANSPORT_RETRIES, get_settings


def test_retry_caps():
    assert MAX_RETRIES == 3
    assert EVALUATOR_TRANSPORT_RETRIES == 3


def test_settings_reads_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "anth-test")
    monkeypatch.setenv("GEMINI_API_KEY", "g-test")
    get_settings.cache_clear()
    s = get_settings()
    assert s.anthropic_api_key == "anth-test"
    assert s.gemini_api_key == "g-test"
    assert s.claude_model == "claude-sonnet-4-6"
    assert s.gemini_model == "gemini-2.5-pro"
    assert s.evaluator_prompt_version == "v1"


def test_settings_evaluator_prompt_version_overridable(monkeypatch):
    monkeypatch.setenv("EVALUATOR_PROMPT_VERSION", "v2")
    get_settings.cache_clear()
    assert get_settings().evaluator_prompt_version == "v2"
