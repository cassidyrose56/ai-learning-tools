import json
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.evaluator import evaluate_grade_level
from app.export import StoryInput, render_bundle, render_docx, render_pdf, safe_filename
from app.generator import generate_story
from app.orchestrator import run_batch
from app.pipeline import TopicParams
from app.presets import PRESETS
from app.schemas import BundleRequest, ExportRequest, GenerateRequest

app = FastAPI(title="AI Learning Tools")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/presets")
async def get_presets() -> dict[str, list[str]]:
    return PRESETS


@app.post("/api/generate")
async def generate(request: GenerateRequest) -> StreamingResponse:
    params = TopicParams(
        child_name=request.child_name,
        reading_level=request.reading_level,
        genre=request.genre,
        pages=request.pages,
        include_drawing_box=request.include_drawing_box,
    )

    async def event_source():
        try:
            async for kind, data in run_batch(
                topics=request.topics,
                params=params,
                generate=generate_story,
                evaluate=evaluate_grade_level,
            ):
                yield f"event: {kind}\ndata: {json.dumps(data)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield (
                "event: error\n"
                f"data: {json.dumps({'story_id': None, 'message': str(exc)})}\n\n"
            )

    return StreamingResponse(event_source(), media_type="text/event-stream")


@app.post("/api/export")
async def export(request: ExportRequest) -> Response:
    story = StoryInput(
        child_name=request.child_name,
        topic=request.topic,
        genre=request.genre,
        text=request.text,
        reading_level=request.reading_level,
        pages=request.pages,
        include_drawing_box=request.include_drawing_box,
    )
    base = safe_filename(request.child_name, request.topic)
    if request.format == "docx":
        blob = render_docx(story)
        media = (
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        )
        filename = f"{base}.docx"
    else:
        blob = render_pdf(story)
        media = "application/pdf"
        filename = f"{base}.pdf"
    return Response(
        content=blob,
        media_type=media,
        headers={"content-disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/export/bundle")
async def export_bundle(request: BundleRequest) -> Response:
    inputs = [
        StoryInput(
            child_name=s.child_name,
            topic=s.topic,
            genre=s.genre,
            text=s.text,
            reading_level=s.reading_level,
            pages=s.pages,
            include_drawing_box=s.include_drawing_box,
        )
        for s in request.stories
    ]
    blob = render_bundle(inputs, fmt=request.format)
    child = safe_filename(request.stories[0].child_name, "stories").split("_")[0]
    filename = f"{child}_stories.zip"
    return Response(
        content=blob,
        media_type="application/zip",
        headers={"content-disposition": f'attachment; filename="{filename}"'},
    )
