"""Atomic Knowledge Processor — Qdrant Upsert + Semantic Search with Versioning.
Handles knowledge evolution: soft delete old versions, create new ones.

Wing: code_chronicles | Topic: knowledge_package | Updated: 2026-07-24
"""

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import (
    ALL_COLLECTIONS,
    DEFAULT_SCORE_THRESHOLD,
    DEFAULT_SEARCH_LIMIT,
    EMBED_DIM,
    LOW_POINTS_THRESHOLD,
    OLLAMA_MODEL,
    OLLAMA_URL,
    QDRANT_API_KEY,
    QDRANT_URL,
)

log = logging.getLogger("meilin-knowledge")

QDRANT_HEADERS = {
    "api-key": QDRANT_API_KEY,
    "Content-Type": "application/json",
}


# ═══════════════════════════════════════════════════════════════════════════════
# Embedding
# ═══════════════════════════════════════════════════════════════════════════════


def _generate_embedding(text: str) -> list[float]:
    """Generate 768-dim embedding via Ollama nomic-embed-text."""
    url = f"{OLLAMA_URL}/api/embeddings"
    payload = {"model": OLLAMA_MODEL, "prompt": text[:8192]}  # truncate to avoid token overflow

    try:
        resp = httpx.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        emb = data.get("embedding")
        if emb and len(emb) == EMBED_DIM:
            return emb
        log.warning("Unexpected embedding dims: %s", len(emb) if emb else None)
    except Exception as e:
        log.error("Embedding error: %s", e)

    return [0.0] * EMBED_DIM


# ═══════════════════════════════════════════════════════════════════════════════
# Qdrant helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _collection_name(wing: str) -> str:
    return f"meilin_{wing}"


def _search_collection(
    collection: str,
    vector: list[float],
    filter_dict: dict | None = None,
    limit: int = DEFAULT_SEARCH_LIMIT,
) -> list[dict]:
    """Search one Qdrant collection with vector + optional filter."""
    url = f"{QDRANT_URL}/collections/{collection}/points/search"
    body: dict[str, Any] = {
        "vector": vector,
        "limit": limit,
        "with_payload": True,
    }
    if filter_dict:
        body["filter"] = filter_dict

    try:
        resp = httpx.post(url, json=body, headers=QDRANT_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("result", []) if data.get("status") == "ok" else []
        return [
            {
                "wing": r["payload"].get("wing", collection.replace("meilin_", "")),
                "topic": r["payload"].get("topic", ""),
                "content": r["payload"].get("content", ""),
                "summary": r["payload"].get("summary", ""),
                "entity_name": r["payload"].get("entity_name", ""),
                "entity_type": r["payload"].get("entity_type", ""),
                "version": r["payload"].get("version", 1),
                "status": r["payload"].get("status", "active"),
                "timestamp": r["payload"].get("timestamp", ""),
                "score": r["score"],
                "change_reason": r["payload"].get("change_reason", ""),
            }
            for r in results
        ]
    except Exception as e:
        log.error("Search error on %s: %s", collection, e)
        return []


def _upsert_point(collection: str, vector: list[float], payload: dict) -> dict:
    """Upsert a single point into a Qdrant collection."""
    url = f"{QDRANT_URL}/collections/{collection}/points"
    point_id = str(uuid.uuid4())
    body = {
        "points": [
            {
                "id": point_id,
                "vector": vector,
                "payload": payload,
            }
        ]
    }
    try:
        resp = httpx.put(url, json=body, headers=QDRANT_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "ok":
            return {"success": True, "point_id": point_id, "operation_id": data.get("result", {}).get("operation_id")}
        return {"success": False, "error": data.get("status", {}).get("error", "Unknown")}
    except Exception as e:
        log.error("Upsert error on %s: %s", collection, e)
        return {"success": False, "error": str(e)}


def _find_existing(wing: str, topic: str, entity_name: str) -> list[dict]:
    """Find existing active points matching wing+topic+entity_name."""
    collection = _collection_name(wing)
    vector = _generate_embedding(f"{topic} {entity_name}")
    filter_dict = {
        "must": [
            {"key": "topic", "match": {"value": topic}},
            {"key": "entity_name", "match": {"value": entity_name}},
            {"key": "status", "match": {"value": "active"}},
        ]
    }
    return _search_collection(collection, vector, filter_dict=filter_dict, limit=10)


def _soft_delete(point_id: str, collection: str) -> bool:
    """Set point status to 'deprecated' (soft delete)."""
    url = f"{QDRANT_URL}/collections/{collection}/points"
    payload = {
        "points": [
            {
                "id": point_id,
                "payload": {"status": "deprecated"},
            }
        ]
    }
    try:
        resp = httpx.put(url, json=payload, headers=QDRANT_HEADERS, timeout=10)
        resp.raise_for_status()
        return True
    except Exception as e:
        log.error("Soft delete error: %s", e)
        return False


def _count_points(collection: str) -> int:
    """Get point count for a collection."""
    url = f"{QDRANT_URL}/collections/{collection}"
    try:
        resp = httpx.get(url, headers=QDRANT_HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "ok":
            return data["result"].get("points_count", 0)
    except Exception:
        pass
    return 0


# ═══════════════════════════════════════════════════════════════════════════════
# Processor class
# ═══════════════════════════════════════════════════════════════════════════════


class AtomicKnowledgeProcessor:
    """Core processor for storing and searching knowledge with evolution support."""

    def process_atom(
        self,
        content: str,
        wing: str = "tcdserver",
        topic: str = "general",
        entity_type: str = "concept",
        entity_name: str = "",
        importance: str = "medium",
        change_reason: str = "Stored via processor",
        summary: str | None = None,
        extra_metadata: dict | None = None,
        project: str | None = None,
    ) -> dict:
        """Store a knowledge atom with versioning (soft delete old, create new)."""
        # 1. Find existing versions
        existing = _find_existing(wing, topic, entity_name) if entity_name else []

        # 2. Determine next version
        next_version = 1
        existing_active = [e for e in existing if e.get("status") == "active"]
        if existing_active:
            next_version = max(e.get("version", 0) for e in existing_active) + 1

        # 3. Generate embedding
        vector = _generate_embedding(content)

        # 4. Build payload
        ts = datetime.now(timezone.utc).isoformat()
        payload = {
            "content": content,
            "wing": wing,
            "topic": topic,
            "entity_name": entity_name or f"atom_{uuid.uuid4().hex[:8]}",
            "entity_type": entity_type,
            "version": next_version,
            "status": "active",
            "timestamp": ts,
            "summary": (summary or content[:200]),
            "change_reason": change_reason,
            "importance": importance,
            "source_file": extra_metadata.pop("source_file", "") if extra_metadata else "",
        }
        if extra_metadata:
            payload["extra_metadata"] = extra_metadata

        # 5. Upsert new version
        collection = _collection_name(wing)
        result = _upsert_point(collection, vector, payload)
        atomic_id = result.get("point_id", "")

        if not result.get("success"):
            return {"success": False, "error": result.get("error", "Upsert failed")}

        # 6. Soft delete old active versions
        for existing_point in existing_active:
            pid = existing_point.get("point_id") or existing_point.get("id", "")
            if pid:
                _soft_delete(pid, collection)

        return {
            "success": True,
            "wing": wing,
            "collection": collection,
            "version": next_version,
            "atomic_id": atomic_id,
        }

    def search(
        self,
        query: str,
        wing: str | None = None,
        topic: str | None = None,
        limit: int = DEFAULT_SEARCH_LIMIT,
    ) -> list[dict]:
        """Semantic search across all (or filtered) wings."""
        vector = _generate_embedding(query)

        if wing:
            # Single-wing search
            collection = _collection_name(wing)
            filter_dict = None
            if topic:
                filter_dict = {"must": [{"key": "topic", "match": {"value": topic}}]}
            results = _search_collection(collection, vector, filter_dict=filter_dict, limit=limit)
            # Filter active only
            results = [r for r in results if r.get("status") == "active"]
            return results[:limit]

        # Search all wings
        all_results = []
        needs_low_threshold = any(_count_points(c) < LOW_POINTS_THRESHOLD for c in ALL_COLLECTIONS)

        for w in [c.replace("meilin_", "") for c in ALL_COLLECTIONS]:
            collection = _collection_name(w)
            filter_dict = {"must": [{"key": "status", "match": {"value": "active"}}]}
            if topic:
                filter_dict["must"].append({"key": "topic", "match": {"value": topic}})

            wing_results = _search_collection(collection, vector, filter_dict=filter_dict, limit=limit)
            # Apply score threshold unless collection is small
            if not needs_low_threshold:
                wing_results = [r for r in wing_results if r.get("score", 0) >= DEFAULT_SCORE_THRESHOLD]
            all_results.extend(wing_results)

        # Sort by score descending
        all_results.sort(key=lambda r: r.get("score", 0), reverse=True)
        return all_results[:limit]
