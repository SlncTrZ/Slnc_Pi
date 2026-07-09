/**
 * pi-core — Native Pi-Core Engine tools integration.
 *
 * Registers all 6 Pi-Core MCP tools (run_pipeline, generate_code, run_sandbox,
 * review, status, health) as direct Pi custom tools with pi_core_ prefix.
 * Eliminates the mcp({ server: "pi-core", tool: "..." }) wrapper — tools are
 * callable natively by the LLM like any built-in tool.
 *
 * Uses lightweight JSON-RPC 2.0 over HTTP (Streamable MCP transport) to
 * communicate with the Pi-Core engine on server .227:3003.
 *
 * Wing: pi-extensions | Topic: pi-core | Updated: 2026-07-09
 */
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── Configuration ───────────────────────────────────────────────────────────

const SERVER_URL = "http://192.168.1.227:3003/mcp";
const TOOL_PREFIX = "pi_core_";
const CLIENT_NAME = "pi-extension";
const CLIENT_VERSION = "1.0.0";

// ─── MCP Client (lightweight, fetch-based, Streamable HTTP) ──────────────────

class McpClient {
  private url: string;
  private sessionId: string | null = null;
  private reqId = 0;
  private _ready = false;

  constructor(url: string) {
    this.url = url;
  }

  get ready(): boolean {
    return this._ready;
  }

  /** Initialize session with MCP server (idempotent). */
  async connect(): Promise<void> {
    if (this._ready) return;
    await this.send("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    });
    // Fire-and-forget initialized notification (no result expected)
    void this.sendRaw("notifications/initialized");
    this._ready = true;
  }

  /** Fetch all tools from the server. */
  async listTools(): Promise<McpToolInfo[]> {
    const result = await this.send("tools/list");
    return (result.tools ?? []) as McpToolInfo[];
  }

  /** Call a tool by name with arguments. */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.send("tools/call", { name, arguments: args });
  }

  /** Disconnect / clean up. */
  async disconnect(): Promise<void> {
    if (this.sessionId) {
      try {
        await fetch(this.url, {
          method: "DELETE",
          headers: { "Mcp-Session-Id": this.sessionId },
        });
      } catch { /* ignore close errors */ }
    }
    this._ready = false;
    this.sessionId = null;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async send(method: string, params?: Record<string, unknown>): Promise<any> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: ++this.reqId,
      method,
      params,
    });

    const res = await fetch(this.url, {
      method: "POST",
      headers: this._headers(),
      body,
    });

    // Capture session ID if server returns one
    const sid = res.headers.get("Mcp-Session-Id");
    if (sid) this.sessionId = sid;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      throw new Error(`Pi-Core MCP: unexpected content-type "${contentType}"`);
    }

    const data = (await res.json()) as McpJsonRpcResponse;
    if (data.error) {
      throw new Error(
        `Pi-Core MCP error [${data.error.code ?? "?"}]: ${data.error.message ?? "unknown"}`,
      );
    }
    return data.result;
  }

  /** Fire-and-forget notification (no id, no result). */
  private async sendRaw(method: string): Promise<void> {
    try {
      await fetch(this.url, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify({ jsonrpc: "2.0", method }),
      });
    } catch { /* best effort */ }
  }

  private _headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, object>;
    required?: string[];
  };
}

interface McpJsonRpcError {
  code?: number;
  message?: string;
}

interface McpJsonRpcResponse {
  jsonrpc: string;
  id?: number | string;
  result?: unknown;
  error?: McpJsonRpcError;
}

// ─── Schema Conversion ───────────────────────────────────────────────────────

/**
 * Convert an MCP JSON Schema to a TypeBox type.
 *
 * We use Type.Unsafe() to pass the raw schema object through, since MCP's
 * inputSchema is a subset of JSON Schema Draft 07 that TypeBox can validate
 * against. This is simpler and more robust than manual field-by-field mapping.
 */
function mcpSchemaToTypeBox(schema: McpToolInfo["inputSchema"]): ReturnType<typeof Type.Object> {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return Type.Object({});
  }

  // Build TypeBox properties
  const props: Record<string, ReturnType<typeof Type.Unsafe>> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    props[key] = Type.Unsafe(value as Record<string, unknown>);
  }

  const required = schema.required ?? [];
  return Type.Object(props, required.length > 0 ? { additionalProperties: false } : {});
}

// ─── Tool name mapping ───────────────────────────────────────────────────────

/**
 * Map MCP tool names to clean, descriptive pi tool names.
 * Strip the underscore prefix pattern and use a consistent pi_core_ prefix.
 */
function mcpNameToPiName(mcpName: string): string {
  return `${TOOL_PREFIX}${mcpName}`;
}

// ─── Extension Entry Point ───────────────────────────────────────────────────

export default function piCoreExtension(pi: ExtensionAPI): void {
  let client: McpClient | null = null;
  let initPromise: Promise<void> | null = null;

  /**
   * Build an execute function for a single MCP tool.
   * Each tool gets its own closure over the tool name.
   */
  function buildExecutor(toolName: string) {
    return async (
      _toolCallId: string,
      params: Record<string, unknown>,
    ): Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }> => {
      const c = client;
      if (!c || !c.ready) {
        throw new Error("Pi-Core client not connected. Try /reload or check server .227:3003.");
      }

      const result = (await c.callTool(toolName, params)) as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      } | undefined;

      const isError = result?.isError === true;
      const text = result?.content
        ? result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("\n")
        : JSON.stringify(result, null, 2);

      if (isError) {
        throw new Error(text || "Pi-Core tool returned an error");
      }

      return {
        content: [{ type: "text" as const, text }],
        details: result ?? {},
      };
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event: SessionStartEvent, _ctx: ExtensionContext) => {
    // Create fresh client
    const c = new McpClient(SERVER_URL);
    client = c;

    // Init in background
    initPromise = (async () => {
      try {
        await c.connect();
        const tools = await c.listTools();

        // Register each tool
        for (const tool of tools) {
          const piName = mcpNameToPiName(tool.name);
          const description = tool.description ?? `Pi-Core: ${tool.name}`;

          pi.registerTool({
            name: piName,
            label: `Pi-Core: ${tool.name}`,
            description,
            promptSnippet: description.length > 100
              ? description.slice(0, 100) + "..."
              : description,
            promptGuidelines: [
              `Use ${piName} to ${description.slice(0, 80).toLowerCase()}`,
            ],
            parameters: mcpSchemaToTypeBox(tool.inputSchema),
            execute: buildExecutor(tool.name),
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Pi-Core extension init failed: ${msg}`);
      } finally {
        initPromise = null;
      }
    })();
  });

  pi.on("session_shutdown", async () => {
    initPromise = null;
    if (client) {
      try {
        await client.disconnect();
      } catch { /* ignore */ }
      client = null;
    }
  });

  // ── Status command for debugging ───────────────────────────────────────────

  pi.registerCommand("pi-core", {
    description: "Show Pi-Core engine connection status",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const c = client;
      if (!c) {
        if (ctx.hasUI) ctx.ui.notify("Pi-Core: not initialized", "error");
        return;
      }

      if (initPromise) {
        if (ctx.hasUI) ctx.ui.notify("Pi-Core: connecting to .227:3003...", "info");
        try {
          await initPromise;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (ctx.hasUI) ctx.ui.notify(`Pi-Core: connection failed — ${msg}`, "error");
          return;
        }
      }

      if (!c.ready) {
        if (ctx.hasUI) ctx.ui.notify("Pi-Core: not connected", "error");
        return;
      }

      // Quick health check
      try {
        const health = await c.callTool("health", {});
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Pi-Core: ✅ connected to .227:3003 | ${JSON.stringify(health)}`,
            "info",
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (ctx.hasUI) ctx.ui.notify(`Pi-Core: health check failed — ${msg}`, "error");
      }
    },
  });
}
