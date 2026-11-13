#!/usr/bin/env bash
# One-command start for VitalOrbit. Opens on http://localhost:8000
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  (command -v uv >/dev/null && uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt) \
    || (python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
fi
exec .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
