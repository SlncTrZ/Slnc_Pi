"""MeiLin MCP SSE Server — wraps stdio MCP server as HTTP SSE.
Chay tren port 8767, ket noi toi Pi qua URL.

Usage: python sse_server.py [--port PORT]
Then add to mcp.json: "url": "http://127.0.0.1:8767/mcp"

Wing: code_chronicles | Topic: mcp_server | Updated: 2026-07-24
"""

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

import uvicorn
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Route, Mount

# Ensure meilin_mcp can find its package
sys.path.insert(0, str(Path(__file__).parent))

from meilin_mcp import server as mcp_server  # noqa: E402

log = logging.getLogger("meilin-sse")


def create_starlette_app(port: int) -> Starlette:
    sse = SseServerTransport("/mcp/messages/")

    async def handle_sse(request):
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as (read_stream, write_stream):
            await mcp_server.run(
                read_stream,
                write_stream,
                mcp_server.create_initialization_options(),
            )

    starlette_app = Starlette(
        debug=False,
        routes=[
            Route("/mcp", endpoint=handle_sse, methods=["GET"]),
            Mount("/mcp/messages/", app=sse.handle_post_message),
        ],
    )
    return starlette_app


def main():
    parser = argparse.ArgumentParser(description="MeiLin MCP SSE Server")
    parser.add_argument("--port", type=int, default=8767, help="Port (default: 8767)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Bind address")
    parser.add_argument("--log-level", type=str, default="info")
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="[meilin-sse] %(levelname)s %(message)s",
    )

    app = create_starlette_app(args.port)
    log.info("MeiLin MCP SSE server on http://%s:%d/mcp", args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level)


if __name__ == "__main__":
    main()
