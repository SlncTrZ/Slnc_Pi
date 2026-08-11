"""MeiLin Knowledge Base — Configuration.
Qdrant REST API + Ollama Embedding connection settings.

Cyber Brain: 2 collection duy nhất (chốt 2026-08-11):
  - cyberbrain_knowledge: {content, domain, project, source}
  - cyberbrain_episodic: {content, agent_name, project, session_id, timestamp}

Wing cũ (6-wing) → domain mới (Cyber Brain schema):
  code_chronicles → code | openclaw/tcdserver → ops | robotics → hardware | omniscience_wiki → research
  conversation → cyberbrain_episodic

Wing: code_chronicles | Topic: knowledge_package | Updated: 2026-08-11
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

# ─── Cyber Brain Collections (2 collection duy nhất) ────────────────
KNOWLEDGE_COLLECTION = "cyberbrain_knowledge"
EPISODIC_COLLECTION = "cyberbrain_episodic"
ALL_COLLECTIONS = [KNOWLEDGE_COLLECTION, EPISODIC_COLLECTION]

# Wing cũ → domain mới (payload schema Cyber Brain)
WING_TO_DOMAIN = {
    "code_chronicles": "code",
    "openclaw": "ops",
    "tcdserver": "ops",
    "robotics": "hardware",
    "omniscience_wiki": "research",
}

# Domain hợp lệ (payload field `domain`)
VALID_DOMAINS = {"code", "ops", "hardware", "research"}


def resolve_collection(wing_or_domain: str) -> str:
    """Ánh xạ wing/domain → collection Cyber Brain.

    - wing cũ 'conversation' hoặc domain bất kỳ → cyberbrain_knowledge?
    Không: 'conversation' (hội thoại) → cyberbrain_episodic; mọi tri thức → cyberbrain_knowledge.
    """
    if wing_or_domain in ("conversation", EPISODIC_COLLECTION):
        return EPISODIC_COLLECTION
    return KNOWLEDGE_COLLECTION


def resolve_domain(wing_or_domain: str) -> str:
    """Chuẩn hoá wing cũ hoặc domain mới về domain payload."""
    if wing_or_domain in WING_TO_DOMAIN:
        return WING_TO_DOMAIN[wing_or_domain]
    if wing_or_domain in VALID_DOMAINS:
        return wing_or_domain
    return "ops"  # default

# ─── Scoring ──────────────────────────────────────────────────────────────────
DEFAULT_SEARCH_LIMIT = 5
DEFAULT_SCORE_THRESHOLD = 0.7
LOW_POINTS_THRESHOLD = 100  # if points_count < this, lower threshold to 1.0
