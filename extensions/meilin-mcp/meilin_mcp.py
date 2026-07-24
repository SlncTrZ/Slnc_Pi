"""
MeiLin MCP Server - 6-Wing Palace Architecture
6-Wing Knowledge + Conversation Memory Room
Tích hợp Atomic Knowledge Processor, Semantic Search, Knowledge Evolution

Wing: code_chronicles
Topic: mcp_server
Last Updated: 2026-04-16
"""

import asyncio
import sys
import os
import logging
from mcp.server.stdio import stdio_server
from mcp.server import Server
import mcp.types as types

# Add meilin_knowledge to path (sibling directory)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meilin_knowledge.config import QDRANT_URL, QDRANT_API_KEY, ALL_COLLECTIONS
from meilin_knowledge.atomic_processor import AtomicKnowledgeProcessor
from meilin_knowledge.garbage_filter import SmartCleaner
from meilin_knowledge.knowledge_history import KnowledgeHistoryViewer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("meilin-mcp")

server = Server("meilin-brain")

# Initialize processors
processor = AtomicKnowledgeProcessor()
history = KnowledgeHistoryViewer()


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        # ─── LEGACY TOOLS (backward compatible) ───
        types.Tool(
            name="tech_store",
            description=(
                "Lưu tri thức kỹ thuật kèm ngữ cảnh (metadata) vào Qdrant. "
                "Hỗ trợ Knowledge Evolution (Soft Delete + Versioning)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "Nội dung chính",
                    },
                    "action": {
                        "type": "string",
                        "description": "Hành động thực hiện (ví dụ: config_ssh, update_firmware)",
                    },
                    "subject": {
                        "type": "string",
                        "description": "Đối tượng chính (ví dụ: RaspberryPi, STM32, n8n)",
                    },
                    "importance": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                },
                "required": ["content", "action", "subject"],
            },
        ),
        types.Tool(
            name="tech_find",
            description=(
                "Tìm kiếm tri thức trong toàn bộ knowledge base (6 Wings). "
                "Semantic search với Qdrant + nomic-embed-text."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Nội dung cần tra cứu"},
                    "wing": {
                        "type": "string",
                        "description": "Lọc theo wing: tcdserver|openclaw|robotics|code_chronicles|omniscience_wiki|conversation",
                    },
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="ai_memory_read",
            description="Đọc ký ức AI (chỉ đọc)",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Nội dung cần tra cứu"},
                },
                "required": ["query"],
            },
        ),

        # ─── NEW 6-WING TOOLS ───
        types.Tool(
            name="knowledge_store",
            description=(
                "Lưu kiến thức vào 6-Wing Palace với Knowledge Evolution. "
                "Tự động phân loại, embed, soft delete bản cũ."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "Nội dung kiến thức"},
                    "wing": {
                        "type": "string",
                        "description": "Wing: tcdserver|openclaw|robotics|code_chronicles|omniscience_wiki|conversation",
                    },
                    "topic": {
                        "type": "string",
                        "description": "Topic (ví dụ: docker_config, skill, code_evolution, AI_Research)",
                    },
                    "entity_name": {"type": "string", "description": "Tên entity"},
                    "entity_type": {
                        "type": "string",
                        "description": "Loại: function|class|concept|skill|config",
                    },
                    "importance": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                    "change_reason": {"type": "string", "description": "Lý do thay đổi"},
                },
                "required": ["content", "wing", "topic"],
            },
        ),
        types.Tool(
            name="knowledge_search",
            description=(
                "Tìm kiếm ngữ nghĩa toàn bộ 6 Wings. "
                "Trả về kết quả kèm score, wing, topic, version."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Query tìm kiếm"},
                    "wing": {
                        "type": "string",
                        "description": "Lọc wing (optional)",
                    },
                    "topic": {
                        "type": "string",
                        "description": "Lọc topic (optional)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Số kết quả tối đa (default: 5)",
                    },
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="knowledge_timeline",
            description="Xem lịch sử tiến hóa của một entity (timeline, versions)",
            inputSchema={
                "type": "object",
                "properties": {
                    "wing": {"type": "string", "description": "Wing name"},
                    "entity_name": {"type": "string", "description": "Tên entity"},
                    "source_file": {"type": "string", "description": "Đường dẫn file"},
                },
                "required": ["wing"],
            },
        ),

        # ─── CONVERSATION MEMORY TOOLS ───
        types.Tool(
            name="conversation_save",
            description=(
                "Lưu đoạn hội thoại vào memory room (meilin_conversation). "
                "Dùng để MeiLin nhớ ngữ cảnh trò chuyện trước đó."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "Nội dung hội thoại (tóm tắt hoặc full)"},
                    "channel": {
                        "type": "string",
                        "description": "Kênh: telegram|cline|openclaw|api",
                    },
                    "session_id": {"type": "string", "description": "Session ID (optional)"},
                    "role": {
                        "type": "string",
                        "description": "Vai trò: user|assistant|summary",
                    },
                    "importance": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                },
                "required": ["content", "channel"],
            },
        ),
        types.Tool(
            name="conversation_recall",
            description=(
                "Tìm kiếm trong lịch sử hội thoại. Semantic search qua meilin_conversation. "
                "Giúp MeiLin nhớ lại ngữ cảnh trò chuyện cũ."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Nội dung cần nhớ lại"},
                    "channel": {
                        "type": "string",
                        "description": "Lọc kênh: telegram|cline|openclaw (optional)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Số kết quả tối đa (default: 5)",
                    },
                },
                "required": ["query"],
            },
        ),
    ]


@server.list_prompts()
async def handle_list_prompts() -> list[types.Prompt]:
    return []


@server.list_resources()
async def handle_list_resources() -> list[types.Resource]:
    return []


@server.call_tool()
async def handle_call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    try:
        args = arguments or {}

        # ═══════════════════════════════════════════════
        # LEGACY: tech_store → auto-classify into 6-Wing
        # ═══════════════════════════════════════════════
        if name == "tech_store":
            content = args.get("content", "")
            action = args.get("action", "")
            subject = args.get("subject", "")
            importance = args.get("importance", "medium")

            # Auto-classify based on subject
            wing, topic = _classify_subject(subject, action)

            result = processor.process_atom(
                content=content,
                wing=wing,
                topic=topic,
                project=subject,
                entity_type="technical_note",
                entity_name=f"{action}_{subject}",
                summary=f"[{action}] {content[:150]}",
                change_reason=f"Stored via tech_store: {action} on {subject}",
                importance=importance,
                extra_metadata={
                    "action": action,
                    "subject": subject,
                    "source": "cline_mcp_windows",
                },
            )

            if result["success"]:
                return [types.TextContent(
                    type="text",
                    text=(
                        f"✅ Đã lưu tri thức vào Wing '{result['wing']}' "
                        f"(v{result['version']}, {result['collection']})\n"
                        f"Atomic ID: {result['atomic_id']}"
                    ),
                )]
            else:
                return [types.TextContent(
                    type="text", text=f"❌ Lỗi: {result.get('error', 'Unknown')}",
                )]

        # ═══════════════════════════════════════════════
        # LEGACY: tech_find → search across all wings
        # ═══════════════════════════════════════════════
        elif name == "tech_find":
            query = args.get("query", "")
            results = processor.search(query, limit=5)

            if not results:
                return [types.TextContent(type="text", text="❌ Không tìm thấy dữ liệu.")]

            output = []
            for r in results:
                output.append(
                    f"📌 WING: {r['wing']} | TOPIC: {r['topic']}\n"
                    f"⏰ TIME: {r['timestamp']} | v{r['version']}\n"
                    f"🎯 SCORE: {r['score']:.3f}\n"
                    f"📝 NỘI DUNG: {r['content'][:500]}"
                )
            return [types.TextContent(type="text", text="\n\n---\n\n".join(output))]

        # ═══════════════════════════════════════════════
        # LEGACY: ai_memory_read → search all (knowledge + conversation)
        # ═══════════════════════════════════════════════
        elif name == "ai_memory_read":
            query = args.get("query", "")

            # Search knowledge wings
            results = processor.search(query, limit=5)
            # Also search conversation memory
            conv_results = processor.search(query, wing="conversation", limit=3)

            all_results = (results or []) + (conv_results or [])
            if all_results:
                output = []
                for r in all_results:
                    output.append(
                        f"📌 WING: {r['wing']} | TOPIC: {r['topic']}\n"
                        f"⏰ TIME: {r['timestamp']}\n"
                        f"📝 {r['content'][:500]}"
                    )
                return [types.TextContent(type="text", text="\n\n---\n\n".join(output))]

            return [types.TextContent(type="text", text="❌ Không tìm thấy dữ liệu.")]

        # ═══════════════════════════════════════════════
        # NEW: knowledge_store → 6-Wing Atomic Store
        # ═══════════════════════════════════════════════
        elif name == "knowledge_store":
            result = processor.process_atom(
                content=args.get("content", ""),
                wing=args.get("wing", "tcdserver"),
                topic=args.get("topic", "general"),
                entity_type=args.get("entity_type", "concept"),
                entity_name=args.get("entity_name", ""),
                importance=args.get("importance", "medium"),
                change_reason=args.get("change_reason", "Stored via MCP"),
            )

            if result["success"]:
                return [types.TextContent(
                    type="text",
                    text=(
                        f"✅ Đã lưu vào Wing '{result['wing']}' "
                        f"(v{result['version']})\n"
                        f"Collection: {result['collection']}\n"
                        f"Atomic ID: {result['atomic_id']}"
                    ),
                )]
            else:
                return [types.TextContent(
                    type="text", text=f"❌ Lỗi: {result.get('error', 'Unknown')}",
                )]

        # ═══════════════════════════════════════════════
        # NEW: knowledge_search → Semantic Search 6 Wings
        # ═══════════════════════════════════════════════
        elif name == "knowledge_search":
            results = processor.search(
                query=args.get("query", ""),
                wing=args.get("wing"),
                topic=args.get("topic"),
                limit=args.get("limit", 5),
            )

            if not results:
                return [types.TextContent(type="text", text="❌ Không tìm thấy kết quả.")]

            output = []
            for r in results:
                output.append(
                    f"📌 WING: {r['wing']} | TOPIC: {r['topic']} | "
                    f"ENTITY: {r['entity_type']}/{r['entity_name']}\n"
                    f"⏰ TIME: {r['timestamp']} | v{r['version']} | "
                    f"SCORE: {r['score']:.3f}\n"
                    f"📝 SUMMARY: {r['summary'][:200]}\n"
                    f"📄 CONTENT: {r['content'][:500]}"
                )
            return [types.TextContent(type="text", text="\n\n---\n\n".join(output))]

        # ═══════════════════════════════════════════════
        # NEW: knowledge_timeline → Version History
        # ═══════════════════════════════════════════════
        elif name == "knowledge_timeline":
            timeline = history.get_timeline(
                wing=args.get("wing", ""),
                entity_name=args.get("entity_name"),
                source_file=args.get("source_file"),
            )

            if not timeline:
                return [types.TextContent(type="text", text="❌ Không tìm thấy timeline.")]

            output = []
            for t in timeline:
                status_icon = "✅" if t["status"] == "active" else "📦"
                output.append(
                    f"{status_icon} v{t['version']} | {t['status']} | "
                    f"{t['timestamp']}\n"
                    f"   Summary: {t['summary'][:100]}\n"
                    f"   Diff: {t.get('diff_summary', 'N/A')}\n"
                    f"   Reason: {t.get('change_reason', 'N/A')}"
                )
            return [types.TextContent(type="text", text="\n\n".join(output))]

        # ═══════════════════════════════════════════════
        # CONVERSATION: conversation_save → Store chat memory
        # ═══════════════════════════════════════════════
        elif name == "conversation_save":
            import time
            result = processor.process_atom(
                content=args.get("content", ""),
                wing="conversation",
                topic="chat_history",
                entity_type="message",
                entity_name=args.get("session_id", f"msg_{int(time.time())}"),
                importance=args.get("importance", "medium"),
                change_reason="Conversation memory save",
                extra_metadata={
                    "channel": args.get("channel", "unknown"),
                    "role": args.get("role", "user"),
                    "session_id": args.get("session_id", ""),
                    "timestamp": int(time.time() * 1000),
                },
            )

            if result["success"]:
                return [types.TextContent(
                    type="text",
                    text=(
                        f"✅ Đã lưu hội thoại vào Memory Room\n"
                        f"Channel: {args.get('channel', 'unknown')} | "
                        f"Role: {args.get('role', 'user')}\n"
                        f"Atomic ID: {result['atomic_id']}"
                    ),
                )]
            else:
                return [types.TextContent(
                    type="text", text=f"❌ Lỗi: {result.get('error', 'Unknown')}",
                )]

        # ═══════════════════════════════════════════════
        # CONVERSATION: conversation_recall → Search chat history
        # ═══════════════════════════════════════════════
        elif name == "conversation_recall":
            results = processor.search(
                query=args.get("query", ""),
                wing="conversation",
                limit=args.get("limit", 5),
            )

            if not results:
                return [types.TextContent(
                    type="text",
                    text="❌ Không tìm thấy hội thoại liên quan.",
                )]

            output = []
            for r in results:
                channel = r.get("entity_type", "unknown")
                role = "unknown"
                # Extract from payload if available
                output.append(
                    f"💬 CHANNEL: {r.get('wing', 'conversation')} | "
                    f"SCORE: {r['score']:.3f}\n"
                    f"⏰ TIME: {r['timestamp']}\n"
                    f"📝 {r['content'][:500]}"
                )
            return [types.TextContent(type="text", text="\n\n---\n\n".join(output))]

        else:
            return [types.TextContent(type="text", text=f"❌ Tool '{name}' không tồn tại.")]

    except Exception as e:
        logger.error(f"Tool error ({name}): {e}", exc_info=True)
        return [types.TextContent(type="text", text=f"🚨 LỖI: {str(e)}")]


def _classify_subject(subject: str, action: str) -> tuple[str, str]:
    """
    Auto-classify legacy tech_store calls into appropriate wing/topic.
    Priority: Code Chronicles > OpenClaw > Robotics > TCDserver > Wiki
    """
    subject_lower = subject.lower()
    action_lower = action.lower()
    combined = f"{subject_lower} {action_lower}"

    # Wing 4: Code Chronicles - code, system, knowledge, MCP, scripts
    if any(kw in combined for kw in [
        "code", "python", "script", "meilin", "knowledge", "mcp",
        "refactor", "implement", "update_code", "fix_bug", "debug",
        "api", "function", "class", "module", "library", "framework",
        "git", "deploy", "config_ssh", "verify_system",
    ]):
        return "code_chronicles", "code_evolution"

    # Wing 2: OpenClaw - AI agents, skills, LLM
    if any(kw in combined for kw in [
        "openclaw", "agent", "skill", "llm", "chatbot", "nlp",
        "embedding", "model", "prompt", "token",
    ]):
        return "openclaw", "skill"

    # Wing 3: Robotics - hardware, sensors, controllers
    if any(kw in combined for kw in [
        "robot", "stm32", "rpi", "raspberry", "sensor", "motor",
        "pid", "imu", "servo", "arduino", "cnc", "pcb",
    ]):
        return "robotics", "algorithm"

    # Wing 5: Omniscience Wiki - research, theory, concepts
    if any(kw in combined for kw in [
        "research", "theory", "concept", "tutorial", "learn",
        "math", "physics", "electronic", "algorithm",
    ]):
        return "omniscience_wiki", "research"

    # Wing 1: TCDserver - infrastructure, docker, server
    if any(kw in combined for kw in [
        "docker", "nginx", "mysql", "container", "server",
        "backup", "restore", "network", "firewall", "ssl",
        "compose", "port", "volume",
    ]):
        return "tcdserver", "docker_config"

    # Default: Code Chronicles (most tech_store calls are code-related)
    return "code_chronicles", "technical_note"


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())