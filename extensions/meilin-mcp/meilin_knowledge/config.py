"""MeiLin Knowledge Base — Configuration.
Qdrant REST API + Ollama Embedding connection settings.

Wing: code_chronicles | Topic: knowledge_package | Updated: 2026-07-24
"""

import json
import os
from pathlib import Path

# ─── Qdrant ───────────────────────────────────────────────────────────────────
QDRANT_HOST = os.environ.get("QDRANT_HOST", "192.168.1.227")
try:
    QDRANT_PORT = int(os.environ.get("QDRANT_PORT", "6333"))
except ValueError:
    QDRANT_PORT = 6333
QDRANT_URL = f"http://{QDRANT_HOST}:{QDRANT_PORT}"


def _load_api_key() -> str:
    """Đọc QDRANT_API_KEY từ env hoặc secrets file (KHÔNG hardcode)."""
    env_key = os.environ.get("QDRANT_API_KEY")
    if env_key:
        return env_key
    secrets_path = Path.home() / ".pi" / "agent" / "secrets" / "qdrant.json"
    if secrets_path.exists():
        try:
            secrets = json.loads(secrets_path.read_text(encoding="utf-8"))
            key = (secrets.get("qdrant") or {}).get("api_key") or ""
            if key:
                return key
        except (OSError, json.JSONDecodeError):
            pass
    return ""


QDRANT_API_KEY = _load_api_key()

# ─── Ollama ───────────────────────────────────────────────────────────────────
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://192.168.1.227:11434")
OLLAMA_URL_LOCAL = os.environ.get("OLLAMA_URL_LOCAL", "http://192.168.1.171:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
EMBED_DIM = 768

# ─── 6-Wing Collections ──────────────────────────────────────────────────────
ALL_COLLECTIONS = [
    "meilin_tcdserver",
    "meilin_openclaw",
    "meilin_robotics",
    "meilin_code_chronicles",
    "meilin_omniscience_wiki",
    "meilin_conversation",
]

# ─── Scoring ──────────────────────────────────────────────────────────────────
DEFAULT_SEARCH_LIMIT = 5
DEFAULT_SCORE_THRESHOLD = 0.7
LOW_POINTS_THRESHOLD = 100  # if points_count < this, lower threshold to 1.0
