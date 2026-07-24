"""MeiLin Knowledge Base — Configuration.
Qdrant REST API + Ollama Embedding connection settings.

Wing: code_chronicles | Topic: knowledge_package | Updated: 2026-07-24
"""

import os

# ─── Qdrant ───────────────────────────────────────────────────────────────────
QDRANT_HOST = os.environ.get("QDRANT_HOST", "192.168.1.227")
QDRANT_PORT = int(os.environ.get("QDRANT_PORT", "6333"))
QDRANT_URL = f"http://{QDRANT_HOST}:{QDRANT_PORT}"
QDRANT_API_KEY = os.environ.get(
    "QDRANT_API_KEY",
    "wQ72uGxOv1kpX5ETBo1FEuKeYWf8ytac11cJIcOg",
)

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
