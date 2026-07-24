"""Knowledge History Viewer — Timeline + Version History for Knowledge Evolution.
Tra ve lich su cac version cua mot entity trong Qdrant.

Wing: code_chronicles | Topic: knowledge_package | Updated: 2026-07-24
"""

import logging

import httpx

from .config import QDRANT_API_KEY, QDRANT_URL

log = logging.getLogger("meilin-knowledge")
QDRANT_HEADERS = {
    "api-key": QDRANT_API_KEY,
    "Content-Type": "application/json",
}


class KnowledgeHistoryViewer:
    """View version history/timeline of knowledge atoms."""

    def get_timeline(
        self,
        wing: str = "",
        entity_name: str | None = None,
        source_file: str | None = None,
    ) -> list[dict]:
        """Get version timeline for an entity across a wing.

        Args:
            wing: Wing name (e.g., 'code_chronicles')
            entity_name: Filter by entity name (optional)
            source_file: Filter by source file path (optional)

        Returns:
            List of version dicts sorted by version descending, each with:
            version, status, timestamp, summary, diff_summary, change_reason
        """
        if not wing:
            return []

        collection = f"meilin_{wing}"
        url = f"{QDRANT_URL}/collections/{collection}/points/scroll"

        # Build filter
        must_conditions = []
        if entity_name:
            must_conditions.append({"key": "entity_name", "match": {"value": entity_name}})
        if source_file:
            must_conditions.append({"key": "source_file", "match": {"value": source_file}})

        body: dict = {
            "limit": 100,
            "with_payload": True,
        }
        if must_conditions:
            body["filter"] = {"must": must_conditions}

        try:
            resp = httpx.post(url, json=body, headers=QDRANT_HEADERS, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            if data.get("status") != "ok":
                return []

            points = data.get("result", {}).get("points", [])
            timeline = []
            for p in points:
                pl = p.get("payload", {})
                timeline.append({
                    "version": pl.get("version", 1),
                    "status": pl.get("status", "active"),
                    "timestamp": pl.get("timestamp", ""),
                    "summary": pl.get("summary", ""),
                    "diff_summary": "",
                    "change_reason": pl.get("change_reason", ""),
                })

            # Sort by version descending
            timeline.sort(key=lambda t: t.get("version", 0), reverse=True)
            return timeline

        except Exception as e:
            log.error("Timeline error: %s", e)
            return []
