from typing import Literal
from pydantic import BaseModel, Field

Genre = Literal["fiction", "non-fiction"]
ReadingLevel = Literal["K", "1", "2", "3", "4", "5"]


class GenerateRequest(BaseModel):
    child_name: str = Field(min_length=1)
    reading_level: ReadingLevel
    genre: Genre
    pages: int = Field(ge=1)
    include_drawing_box: bool = False
    topics: list[str] = Field(min_length=1)


class StoryPayload(BaseModel):
    child_name: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    genre: Genre
    text: str
    reading_level: ReadingLevel
    pages: int = Field(ge=1)
    include_drawing_box: bool = False


class ExportRequest(StoryPayload):
    format: Literal["docx", "pdf"]


class BundleRequest(BaseModel):
    format: Literal["docx", "pdf"]
    stories: list[StoryPayload] = Field(min_length=1)


class EvalResult(BaseModel):
    matched: bool
    predicted_grade: str | None
    feedback: str


class StartedEvent(BaseModel):
    story_id: str
    topic: str


class AttemptEvent(BaseModel):
    story_id: str
    attempt: int


class DoneEvent(BaseModel):
    story_id: str
    text: str
    predicted_grade: str | None
    matched: bool
    attempts: int


class ErrorEvent(BaseModel):
    story_id: str | None
    message: str
