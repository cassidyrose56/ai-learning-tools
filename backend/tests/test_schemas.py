import pytest
from pydantic import ValidationError
from app.schemas import (
    GenerateRequest,
    ExportRequest,
    BundleRequest,
    Genre,
    ReadingLevel,
)


def test_generate_request_minimal_valid():
    req = GenerateRequest(
        child_name="Maya",
        reading_level="3",
        genre="fiction",
        pages=2,
        topics=["Soccer"],
    )
    assert req.include_drawing_box is False
    assert req.topics == ["Soccer"]


def test_generate_request_rejects_invalid_level():
    with pytest.raises(ValidationError):
        GenerateRequest(
            child_name="Maya",
            reading_level="6",
            genre="fiction",
            pages=1,
            topics=["A"],
        )


def test_generate_request_rejects_empty_topics():
    with pytest.raises(ValidationError):
        GenerateRequest(
            child_name="Maya",
            reading_level="3",
            genre="fiction",
            pages=1,
            topics=[],
        )


def test_generate_request_rejects_pages_zero():
    with pytest.raises(ValidationError):
        GenerateRequest(
            child_name="Maya",
            reading_level="3",
            genre="fiction",
            pages=0,
            topics=["A"],
        )


def test_export_request_pdf_round_trip():
    req = ExportRequest(
        format="pdf",
        child_name="Maya",
        topic="Soccer",
        genre="fiction",
        text="Once upon a time.",
        reading_level="3",
        pages=2,
        include_drawing_box=True,
    )
    assert req.format == "pdf"


def test_bundle_request_requires_one_story():
    with pytest.raises(ValidationError):
        BundleRequest(format="pdf", stories=[])
