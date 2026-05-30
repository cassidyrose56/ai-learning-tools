import asyncio
import json
import logging
from functools import lru_cache
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import EVALUATOR_TRANSPORT_RETRIES, get_settings
from app.pedagogy import GRADE_TO_BAND
from app.schemas import EvalResult

log = logging.getLogger(__name__)

_PROMPT_ROOT = Path(__file__).parent / "evaluator_prompts"


def _band_for_grade(grade: str) -> str:
    return GRADE_TO_BAND[grade]


def _active_version() -> str:
    return get_settings().evaluator_prompt_version


@lru_cache(maxsize=8)
def _load_prompts(version: str) -> tuple[str, str]:
    base = _PROMPT_ROOT / "grade-level" / version
    return (
        (base / "system.txt").read_text(encoding="utf-8"),
        (base / "user.txt").read_text(encoding="utf-8"),
    )


@lru_cache
def _llm() -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=get_settings().gemini_model,
        temperature=0.25,
        timeout=120,
        google_api_key=get_settings().google_api_key,
    )


_BACKOFF = [0.5, 1.0, 2.0]


def _build_feedback(payload: dict) -> str:
    # `scaffolding_needed` (from upstream rubric) describes teacher-facing
    # supports for reading the text at the lower `alternative_grade` band —
    # it's not generator-revision guidance, and we deliberately don't feed
    # it back to Claude. We ask Gemini for a separate `revision_guidance`
    # field in the JSON footer and use that for the regenerator prompt.
    reasoning = str(payload.get("reasoning", "")).strip()
    alt = str(payload.get("alternative_grade", "")).strip()
    revision = str(payload.get("revision_guidance", "")).strip()
    parts: list[str] = []
    if reasoning:
        parts.append(f"Reasoning: {reasoning}")
    if alt:
        parts.append(f"Closer fit was band {alt}.")
    if revision:
        parts.append(f"Suggested revisions: {revision}")
    return " ".join(parts)


async def evaluate_grade_level(text: str, target_reading_level: str) -> EvalResult:
    system_prompt, user_prompt = _load_prompts(_active_version())
    # The upstream user prompt expects a {text} placeholder. We also pass
    # the target grade as context for the judge to anchor on.
    hydrated_user = (
        f"Target student grade: {target_reading_level}\n\n"
        f"Procedure:\n{user_prompt}\n\n"
        f"Text to evaluate:\n{text}\n\n"
        "Return JSON only, no prose, with these fields: "
        '{"reasoning": "...", "grade": "<band>", '
        '"alternative_grade": "<band>", "scaffolding_needed": "...", '
        '"revision_guidance": "..."}. '
        "`scaffolding_needed` is the upstream rubric's teacher-facing "
        "supports for reading at `alternative_grade` (pictures, "
        "pre-teaching, read-aloud, etc.). `revision_guidance` is "
        "separate: concrete suggestions for revising the TEXT itself "
        "(shorter sentences, simpler vocabulary, fewer concepts, or — "
        "if the text is too easy — longer sentences, richer vocabulary) "
        "so the next draft better hits the target student grade. "
        "Populate `revision_guidance` whether the text is currently too "
        "hard OR too easy."
    )
    expected_band = _band_for_grade(target_reading_level)
    llm = _llm()

    last_err: Exception | None = None
    for attempt in range(EVALUATOR_TRANSPORT_RETRIES):
        try:
            response = await llm.ainvoke(
                [SystemMessage(content=system_prompt), HumanMessage(content=hydrated_user)]
            )
            raw = response.content or ""
            data = json.loads(raw)
            predicted_band = str(data["grade"])
            return EvalResult(
                appropriate=(predicted_band == expected_band),
                predicted_grade=predicted_band,
                feedback=_build_feedback(data),
            )
        except Exception as exc:  # noqa: BLE001 — transport, parse, and shape errors all retry
            # JSONDecodeError / KeyError indicate the model returned the
            # wrong shape; with temperature=0.25 a second roll often parses.
            # Other Exceptions are SDK / transport failures. Both retry.
            last_err = exc
            log.warning("evaluator attempt %s failed: %s", attempt + 1, exc)
            if attempt < EVALUATOR_TRANSPORT_RETRIES - 1:
                await asyncio.sleep(_BACKOFF[attempt])
    log.error("evaluator unavailable after retries: %s", last_err)
    return EvalResult(
        appropriate=False, predicted_grade=None, feedback="evaluator unavailable"
    )
