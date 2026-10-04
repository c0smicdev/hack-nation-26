import hmac
import os
from contextlib import asynccontextmanager
from threading import Lock

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from engine import MAX_IMAGE_BYTES, POLICY_VERSION, PrivacyBlocked, PrivacyEngine

engine: PrivacyEngine | None = None
engine_lock = Lock()


@asynccontextmanager
async def lifespan(_app):
    global engine
    if len(os.environ.get("SOCRATES_PRIVACY_TOKEN", "")) < 32:
        raise RuntimeError("A strong service token is required")
    engine = PrivacyEngine(os.environ.get("SOCRATES_PRIVACY_ALIAS_KEY", ""))
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def authorize(authorization: str = Header(default="")):
    expected = "Bearer " + os.environ.get("SOCRATES_PRIVACY_TOKEN", "")
    if len(expected) < 39 or not hmac.compare_digest(authorization, expected):
        raise HTTPException(401, "Unauthorized")


@app.middleware("http")
async def body_limit(request: Request, call_next):
    limit = MAX_IMAGE_BYTES * 4 // 3 + 100_000
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            return JSONResponse({"error": "request_too_large"}, status_code=413)
    request._body = bytes(body)
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    return JSONResponse({"error": "invalid_request"}, status_code=400)


@app.exception_handler(PrivacyBlocked)
async def privacy_blocked(_request, error):
    return JSONResponse({"error": error.code}, status_code=422)


@app.exception_handler(Exception)
async def processing_failed(_request, _error):
    return JSONResponse({"error": "processing_failed"}, status_code=503)


class Rect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def bounds(self):
        if self.x + self.width > 1 or self.y + self.height > 1:
            raise ValueError("Invalid bounds")
        return self


class ImageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image: str = Field(max_length=MAX_IMAGE_BYTES * 4 // 3 + 4)
    mime: str = Field(pattern=r"^image/(png|jpeg)$")
    masks: list[Rect] = Field(default_factory=list, max_length=100)


class TextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    texts: list[str] = Field(max_length=2000)


@app.get("/ready")
def ready():
    return JSONResponse({"ready": engine is not None}, status_code=200 if engine is not None else 503)


@app.get("/health", dependencies=[Depends(authorize)])
def health():
    return {"ready": engine is not None, "policyVersion": POLICY_VERSION}


@app.post("/redact/image", dependencies=[Depends(authorize)])
def redact_image(data: ImageInput):
    if engine is None:
        raise HTTPException(503, "Not ready")
    with engine_lock:
        try:
            return engine.image(data.image, data.mime, [r.model_dump() for r in data.masks])
        except PrivacyBlocked:
            raise
        except Exception:
            raise HTTPException(503, "Processing could not complete") from None


@app.post("/redact/text", dependencies=[Depends(authorize)])
def redact_text(data: TextInput):
    if engine is None or sum(len(t) for t in data.texts) > 160_000:
        raise HTTPException(413, "Text budget exceeded")
    with engine_lock:
        try:
            return {"results": [engine.text(text) for text in data.texts]}
        except Exception:
            raise HTTPException(503, "Processing could not complete") from None
