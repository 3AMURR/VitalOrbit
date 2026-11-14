"""Vercel entrypoint: exposes the FastAPI app. Locally, keep using ./run.sh."""
from backend.main import app  # noqa: F401
