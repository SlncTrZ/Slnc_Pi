/**
 * Tool Orchestrator — Dynamic Tool Injection via Intent Matching.
 *
 * Reduces static tool schema overhead by keeping only core tools active
 * and injecting group tools on-demand when intent keywords are matched.
 *
 * Wing: pi-extensions | Topic: tool-orchestrator | Updated: 2026-07-23 15:20
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/* ──────────────────────────────────────────────
 * TOOL GROUP DEFINITIONS
 * ────────────────────────────────────────────── */

interface ToolGroup {
  keywords: string[];
  tools: string[];
}

const TOOL_GROUPS: Record<string, ToolGroup> = {
  /* ALWAYS ACTIVE — injected by default */
  core: {
    keywords: [],
    tools: ["read", "write", "edit", "bash", "grep", "find", "mcp", "save_conversation"],
  },

  /* CODE INTELLIGENCE — search, symbols, navigation */
  "code-intel": {
    keywords: [
      "search", "symbol", "definition", "outline", "navigate",
      "find function", "show class", "read file", "module",
      "where is", "find definition", "go to", "lookup",
    ],
    tools: ["symbol_search", "module_report", "read_symbol", "read_enclosing", "pi_lens_activate_tools"],
  },

  /* DIAGNOSTICS — errors, warnings, linting */
  diagnostics: {
    keywords: [
      "error", "warning", "diagnostic", "lint", "check",
      "fix error", "compile error", "type error", "bug",
      "test fail", "build fail", "blocking", "lens",
      "verify", "audit",
    ],
    tools: ["lens_diagnostics", "lsp_diagnostics"],
  },

  /* WEB RESEARCH — search, fetch, browse */
  web: {
    keywords: [
      "search web", "research", "look up", "browse", "fetch",
      "find online", "google", "documentation", "tutorial",
      "npm package", "library", "api reference",
    ],
    tools: ["web_search", "fetch_content", "get_search_content"],
  },

  /* LEAN CONTEXT — project structure, code graph, semantic search */
  "lean-ctx": {
    keywords: [
      "project", "context", "graph", "dependency", "semantic",
      "architecture", "structure", "overview", "codebase",
      "impact", "blast radius", "knowledge", "remember",
      "session", "compress",
    ],
    tools: [
      "ctx_shell", "ctx_read", "ctx_ls", "ctx_find", "ctx_grep",
      "lean_ctx", "ctx_edit", "ctx_call", "ctx_expand", "ctx_graph",
      "ctx_knowledge", "ctx_overview", "ctx_provider", "ctx_search",
      "ctx_semantic_search", "ctx_session", "ctx_tree", "shell",
      "ctx_compress", "ctx_dedup",
    ],
  },

  /* ORCHESTRATION — workflows, subagents, pipelines */
  orchestration: {
    keywords: [
      "workflow", "subagent", "delegate", "parallel", "pipeline",
      "fan out", "orchestrate", "background", "agent group",
      "multi-agent", "distribute",
    ],
    tools: ["workflow", "workflow_control"],
  },

  /* PI-CORE — autonomous pipeline, sandbox, review */
  "pi-core": {
    keywords: [
      "autonomous", "pipeline", "sandbox", "generate code",
      "review code", "deepseek api", "code generation",
      "docker sandbox", "code review",
    ],
    tools: [
      "pi_core_run_pipeline", "pi_core_generate_code",
      "pi_core_run_sandbox", "pi_core_review",
      "pi_core_status", "pi_core_health",
    ],
  },

  /* GOAL — goal tracking */
  goal: {
    keywords: [
      "goal", "objective", "task complete", "blocked",
      "mark done", "complete task",
    ],
    tools: ["goal_complete", "goal_blocked"],
  },
};

/* ──────────────────────────────────────────────
 * KEYWORD → GROUP INDEX (memoized, built once)
 * ────────────────────────────────────────────── */

let _keywordIndex: Map<string, string> | null = null;

function getKeywordIndex(): Map<string, string> {
  if (_keywordIndex) return _keywordIndex;

  const index = new Map<string, string>();
  for (const [groupName, group] of Object.entries(TOOL_GROUPS)) {
    if (groupName === "core") continue;
    for (const keyword of group.keywords) {
      index.set(keyword.toLowerCase(), groupName);
    }
  }
  _keywordIndex = index;
  return index;
}

/* ──────────────────────────────────────────────
 * INTENT MATCHER — rank groups by query relevance
 * ────────────────────────────────────────────── */

function matchGroups(query: string): string[] {
  const terms = query.toLowerCase().split(/[^a-z0-9+\-_.]+/).filter(Boolean);
  const scores = new Map<string, number>();
  const keywordIndex = getKeywordIndex();

  for (const term of terms) {
    for (const [keyword, groupName] of keywordIndex) {
      if (keyword.includes(term) || term.includes(keyword)) {
        scores.set(groupName, (scores.get(groupName) ?? 0) + 1);
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

/* ──────────────────────────────────────────────
 * TOOL GROUP LOOKUP
 * ────────────────────────────────────────────── */

function getToolsForGroups(groupNames: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of groupNames) {
    const group = TOOL_GROUPS[name];
    if (!group) continue;
    for (const tool of group.tools) {
      if (!seen.has(tool)) {
        seen.add(tool);
        result.push(tool);
      }
    }
  }
  return result;
}

function getAllNonCoreToolNames(): Set<string> {
  const names = new Set<string>();
  for (const [groupName, group] of Object.entries(TOOL_GROUPS)) {
    if (groupName === "core") continue;
    for (const tool of group.tools) {
      names.add(tool);
    }
  }
  return names;
}

/* ──────────────────────────────────────────────
 * EXTENSION ENTRY POINT
 * ────────────────────────────────────────────── */

export default function (pi: ExtensionAPI) {
  const NON_CORE_TOOLS = getAllNonCoreToolNames();
  const CORE_TOOLS = TOOL_GROUPS.core.tools;
  const LOADER_TOOLS = ["search_tools", "deactivate_tools"];
  const ACTIVE_GROUP_CACHE = new Set<string>();

  /* ── search_tools: activate tools by intent ── */
  pi.registerTool({
    name: "search_tools",
    label: "Search Tools",
    description: "Search for and activate tools relevant to your current task. Call this when you need capabilities beyond the currently available tools.",
    promptSnippet: "Use search_tools to find and activate additional tools for your task",
    promptGuidelines: [
      "When you need a capability not in the current tool set, use search_tools with a description of what you want to do.",
      "Common groups: code-intel (symbols, definitions), diagnostics (errors, lint), web (search, fetch), lean-ctx (project structure), orchestration (workflows), pi-core (autonomous pipeline).",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Describe the capability or task you need tools for" }),
    }),
    async execute(_toolCallId, params) {
      const matchedGroups = matchGroups(params.query);

      if (matchedGroups.length === 0) {
        const available = Object.keys(TOOL_GROUPS).filter(g => g !== "core").join(", ");
        return {
          content: [{ type: "text", text: `No relevant tool groups found for: "${params.query}". Available groups: ${available}` }],
          details: { matches: [] },
        };
      }

      const toolsToActivate = getToolsForGroups(matchedGroups);
      const currentActive = pi.getActiveTools();
      const added = toolsToActivate.filter(t => !currentActive.includes(t));

      if (added.length > 0) {
        pi.setActiveTools([...new Set([...currentActive, ...added])]);
        for (const group of matchedGroups) ACTIVE_GROUP_CACHE.add(group);
      }

      return {
        content: [{
          type: "text",
          text: added.length > 0
            ? `✅ Activated groups: ${matchedGroups.join(", ")}\n   Loaded: ${added.join(", ")}`
            : `ℹ️ Already active: ${matchedGroups.join(", ")}`,
        }],
        details: { matches: matchedGroups, added },
      };
    },
  });

  /* ── deactivate_tools: remove group tools ── */
  pi.registerTool({
    name: "deactivate_tools",
    label: "Deactivate Tools",
    description: "Deactivate previously loaded tool groups to reduce context overhead. Specify which groups to remove.",
    parameters: Type.Object({
      groups: Type.Optional(Type.Array(Type.String({ description: "Group names: code-intel, diagnostics, web, lean-ctx, orchestration, pi-core, goal" }))),
      all: Type.Optional(Type.Boolean({ description: "Set true to deactivate all non-core groups" })),
    }),
    async execute(_toolCallId, params) {
      const currentActive = pi.getActiveTools();
      let toDeactivate: string[];

      if (params.all) {
        toDeactivate = currentActive.filter(t => NON_CORE_TOOLS.has(t));
      } else if (params.groups?.length) {
        toDeactivate = getToolsForGroups(params.groups.filter(g => ACTIVE_GROUP_CACHE.has(g)));
      } else {
        return {
          content: [{ type: "text", text: "Specify groups to deactivate, or set all: true" }],
          details: {},
        };
      }

      const otherTools = currentActive.filter(t => !toDeactivate.includes(t) && !CORE_TOOLS.includes(t) && !LOADER_TOOLS.includes(t) && !NON_CORE_TOOLS.has(t));
      pi.setActiveTools([...CORE_TOOLS, ...LOADER_TOOLS, ...otherTools]);

      return {
        content: [{ type: "text", text: `✅ Deactivated ${toDeactivate.length} tools. Core + loaders remain.` }],
        details: { deactivated: toDeactivate },
      };
    },
  });

  /* ── /orchestrate command ── */
  pi.registerCommand("orchestrate", {
    description: "Manually control tool groups: /orchestrate activate <group1,group2> | deactivate <group1,group2> | status",
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify("Usage: /orchestrate activate|deactivate|status [groups]", "info");
        return;
      }

      const [command, ...rest] = parts;
      const groupNames = rest.join("").split(",").filter(Boolean);

      if (command === "status") {
        const activeTools = pi.getActiveTools();
        const groups = [...ACTIVE_GROUP_CACHE].filter(g => g !== "core");
        ctx.ui.notify(`Groups: ${groups.join(", ") || "none"}\nTools: ${activeTools.length} active`, "info");
        return;
      }

      if (command === "activate") {
        const current = pi.getActiveTools();
        const toAdd = getToolsForGroups(groupNames.filter(g => g !== "core"));
        const added = toAdd.filter(t => !current.includes(t));
        if (added.length) {
          pi.setActiveTools([...new Set([...current, ...added])]);
          for (const g of groupNames) ACTIVE_GROUP_CACHE.add(g);
        }
        ctx.ui.notify(`Activated ${groupNames.join(", ")} (${added.length} tools)`, "info");
        return;
      }

      if (command === "deactivate") {
        const current = pi.getActiveTools();
        const toRemove = getToolsForGroups(groupNames);
        const keep = current.filter(t => !toRemove.includes(t) && !CORE_TOOLS.includes(t) && !LOADER_TOOLS.includes(t) && !NON_CORE_TOOLS.has(t));
        pi.setActiveTools([...CORE_TOOLS, ...LOADER_TOOLS, ...keep]);
        for (const g of groupNames) ACTIVE_GROUP_CACHE.delete(g);
        ctx.ui.notify(`Deactivated ${groupNames.join(", ")}`, "info");
        return;
      }

      ctx.ui.notify(`Unknown: ${command}. Use: activate, deactivate, status`, "warning");
    },
  });

  /* ── session_start: enforce minimal initial toolset ── */
  pi.on("session_start", async () => {
    const current = pi.getActiveTools();
    const otherExtTools = current.filter(
      t => !NON_CORE_TOOLS.has(t) && !CORE_TOOLS.includes(t) && !LOADER_TOOLS.includes(t),
    );
    pi.setActiveTools([...new Set([...CORE_TOOLS, ...LOADER_TOOLS, ...otherExtTools])]);
    ACTIVE_GROUP_CACHE.clear();
  });

  /* ── before_agent_start: auto-activate by prompt intent ── */
  pi.on("before_agent_start", async (event) => {
    const matchedGroups = matchGroups(event.prompt);
    if (matchedGroups.length === 0) return;

    const toolsToActivate = getToolsForGroups(matchedGroups);
    const currentActive = pi.getActiveTools();
    const added = toolsToActivate.filter(t => !currentActive.includes(t));

    if (added.length > 0) {
      pi.setActiveTools([...new Set([...currentActive, ...added])]);
      for (const group of matchedGroups) ACTIVE_GROUP_CACHE.add(group);
    }
  });
}
