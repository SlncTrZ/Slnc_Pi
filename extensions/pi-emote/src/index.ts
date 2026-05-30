import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";

import type { EmoteState, ResolvedRenderer } from "./types.js";
import type { Renderer } from "./renderer.js";
import { log, setDebug } from "./log.js";
import { loadLayeredConfig, saveUserDefaultEmoteSet } from "./config.js";
import { resolveEmoteSet, findEmoteSetDir, loadEmotesConfig, listEmoteSets } from "./emotes.js";
import { KittyRenderer } from "./render_kitty.js";
import { TmuxKittyRenderer } from "./render_tmux_kitty.js";
import { TmuxKittyUnicodeRenderer } from "./render_tmux_kitty_unicode.js";
import { ITermRenderer } from "./render_iterm.js";
import { TmuxITermRenderer } from "./render_tmux_iterm.js";
import { SixelRenderer } from "./render_sixel.js";
import { AsciiRenderer } from "./render_ascii.js";
import { Animator } from "./animator.js";
import { createWidgetFactory } from "./widget.js";
import { resolveRenderer } from "./terminal.js";

const IMAGE_STATES = ["hi", "idle", "think", "talk", "read", "write", "tool", "success", "failure", "compact"];

/** Check if a set directory contains any image frames (PNG files in state subdirs). */
function hasImageFrames(setDir: string): boolean {
  for (const state of IMAGE_STATES) {
    const stateDir = join(setDir, state);
    if (existsSync(stateDir)) {
      const files = readdirSync(stateDir).filter((f) => f.endsWith(".png"));
      if (files.length > 0) return true;
    }
  }
  return false;
}

function toolNameToState(toolName: string): EmoteState {
  switch (toolName) {
    case "read": return "read";
    case "write":
    case "edit": return "write";
    default: return "tool";
  }
}

function createRendererFromResolved(resolved: ResolvedRenderer, size: number): Renderer {
  const { protocol, multiplexer } = resolved;
  if (protocol === "kitty-unicode") {
    log(`createRenderer: using TmuxKittyUnicodeRenderer`);
    return new TmuxKittyUnicodeRenderer(size);
  }
  if (protocol === "kitty") {
    if (multiplexer === "tmux") {
      log(`createRenderer: using TmuxKittyRenderer`);
      return new TmuxKittyRenderer(size);
    }
    log(`createRenderer: using KittyRenderer`);
    return new KittyRenderer(size);
  }
  if (protocol === "iterm2") {
    if (multiplexer === "tmux") {
      log(`createRenderer: using TmuxITermRenderer`);
      return new TmuxITermRenderer(size);
    }
    log(`createRenderer: using ITermRenderer`);
    return new ITermRenderer(size);
  }
  if (protocol === "sixel") {
    log(`createRenderer: using SixelRenderer`);
    return new SixelRenderer(size);
  }
  log(`createRenderer: using AsciiRenderer`);
  return new AsciiRenderer();
}

export default function (pi: ExtensionAPI) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const extDir = dirname(__dirname);

  let cwd = process.cwd();
  let { config, userConfiguredTerminals } = loadLayeredConfig(extDir, cwd);
  setDebug(config.debug);

  // TTS mode from notification extension — suppresses streaming talk
  let ttsModeEnabled = false;

  if (!config.enabled) return;

  // Emote set state
  let currentEmoteSet = "default";
  let ctxRef: any = null;
  let widgetActive = false;
  let lastResolved = resolveRenderer(config.terminals, userConfiguredTerminals);
  let renderer = createRendererFromResolved(lastResolved, config.size);

  const animator = new Animator(config, renderer);

  // --- TTS sync: listen for events from notification extension ---
  // Registered at top level (before session_start) so we don't miss the tts:mode event.
  pi.events.on("tts:mode", (data: unknown) => {
    const m = (data as { mode?: string })?.mode;
    ttsModeEnabled = m === "tts" || m === "both";
    log(`tts:mode = ${m}`);
  });
  pi.events.on("tts:start", () => {
    if (!widgetActive) return;
    log("tts:start");
    animator.enterTtsTalk();
  });
  pi.events.on("tts:end", () => {
    if (!widgetActive) return;
    log("tts:end");
    animator.exitTtsTalk();
  });

  function loadEmoteSet(setName: string) {
    currentEmoteSet = setName;

    const setDir = findEmoteSetDir(setName, extDir, cwd);
    const isAsciiOnly = existsSync(join(setDir, "ascii.yaml")) && !hasImageFrames(setDir);

    if (isAsciiOnly) {
      // ASCII-only set — use AsciiRenderer regardless of terminal
      if (!(renderer instanceof AsciiRenderer)) {
        renderer = new AsciiRenderer();
        animator.setRenderer(renderer);
      }
    } else {
      // Ensure we're using the capability-based renderer
      const detected = createRendererFromResolved(lastResolved, config.size);
      if (renderer.constructor !== detected.constructor) {
        renderer = detected;
        animator.setRenderer(renderer);
      }
    }

    const emotesConfig = loadEmotesConfig(setDir);
    renderer.loadFrames(setDir, extDir);
    animator.setEmotesConfig(emotesConfig);
  }

  loadEmoteSet("default");

  function switchEmoteSetForModel(modelId: string) {
    const setName = resolveEmoteSet(modelId, config.emotes);
    if (setName !== currentEmoteSet) {
      loadEmoteSet(setName);
      log(`switchEmoteSet: loaded "${setName}", state="${animator.currentState}"`);
      animator.resetRenderCache();
      if (widgetActive && animator.currentState === "idle") {
        animator.enterIdle();
      } else if (widgetActive) {
        renderer.showRandomFrame(animator.currentState, true);
      }
    }
  }

  function refreshCurrentFrame() {
    animator.resetRenderCache();
    if (widgetActive && animator.currentState === "idle") {
      animator.enterIdle();
    } else if (widgetActive) {
      renderer.showRandomFrame(animator.currentState, true);
    }
  }

  function autocompleteEmoteCommand(prefix: string): AutocompleteItem[] | null {
    const sets = listEmoteSets(extDir, cwd);
    const trimmed = prefix.trimStart();

    if (trimmed.startsWith("set ")) {
      const partial = trimmed.slice(4).toLowerCase();
      const matches = sets
        .filter((setName) => setName.toLowerCase().startsWith(partial))
        .map((setName) => ({ value: `set ${setName}`, label: setName }));
      return matches.length > 0 ? matches : null;
    }

    return [
      { value: "list", label: "list" },
      { value: "set ", label: "set <emote-set>" },
    ].filter((item) => item.value.startsWith(trimmed)) as AutocompleteItem[];
  }

  pi.registerCommand("emote", {
    description: "List or set the pi-emote face set",
    getArgumentCompletions: autocompleteEmoteCommand,
    handler: async (args, ctx) => {
      const sets = listEmoteSets(extDir, cwd);
      const [subcommand, setName, ...extra] = args.trim().split(/\s+/).filter(Boolean);

      if (!subcommand || subcommand === "list") {
        ctx.ui.notify(
          `[pi-emote] Current emote set: ${currentEmoteSet}\nAvailable emote sets: ${sets.join(", ")}`,
          "info",
        );
        return;
      }

      if (subcommand !== "set" || !setName || extra.length > 0) {
        ctx.ui.notify(`[pi-emote] Usage: /emote list or /emote set <${sets.join("|")}>`, "warning");
        return;
      }

      if (!sets.includes(setName)) {
        ctx.ui.notify(`[pi-emote] Unknown emote set "${setName}". Available: ${sets.join(", ")}`, "warning");
        return;
      }

      try {
        saveUserDefaultEmoteSet(setName);
        ({ config, userConfiguredTerminals } = loadLayeredConfig(extDir, cwd));
        setDebug(config.debug);
        animator.updateConfig(config);
        loadEmoteSet(setName);
        refreshCurrentFrame();
        ctx.ui.notify(`[pi-emote] Emote set changed to "${setName}". Saved to user config.`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`[pi-emote] Failed to set emote set: ${message}`, "error");
      }
    },
  });

  // --- Events ---

  pi.on("session_start", async (_event, ctx) => {
    log(`session_start: hasUI=${ctx.hasUI}`);
    if (!ctx.hasUI) return;

    animator.clearAllTimers();
    cwd = ctx.cwd;
    ({ config, userConfiguredTerminals } = loadLayeredConfig(extDir, cwd));
    setDebug(config.debug);
    animator.updateConfig(config);

    // Re-create renderer in case terminal capabilities changed
    lastResolved = resolveRenderer(config.terminals, userConfiguredTerminals);
    renderer = createRendererFromResolved(lastResolved, config.size);
    animator.setRenderer(renderer);

    if (lastResolved.warning) {
      ctx.ui.notify(lastResolved.warning, lastResolved.warningLevel);
    } else if (renderer instanceof AsciiRenderer) {
      ctx.ui.notify("[pi-emote] No image protocol detected \u2014 using ASCII emotes.", "warning");
    }

    ctxRef = ctx;

    if (!config.enabled) return;

    // Resolve emote set for current model
    const modelId = ctx.model?.id ?? "";
    const setName = resolveEmoteSet(modelId, config.emotes);
    log(`session_start: model="${modelId}" set="${setName}" dir="${findEmoteSetDir(setName, extDir, cwd)}"`);
    loadEmoteSet(setName);

    // Create widget
    ctx.ui.setWidget("emote", createWidgetFactory({
      animator,
      config,
      pi,
      getCtxRef: () => ctxRef,
      getCurrentEmoteSet: () => currentEmoteSet,
    }), { placement: "aboveEditor" });

    widgetActive = true;
    setTimeout(() => animator.transitionTo("hi"), 500);

  });

  pi.on("session_shutdown", async (_event, ctx) => {
    animator.clearAllTimers();
    animator.disposeRenderer();
    if (widgetActive && ctx.hasUI) {
      ctx.ui.setWidget("emote", undefined);
      widgetActive = false;
    }
    animator.setTui(null);
    ctxRef = null;
  });

  pi.on("model_select", async (event) => {
    if (!widgetActive) return;
    const modelId = event.model?.id ?? "";
    const resolved = resolveEmoteSet(modelId, config.emotes);
    log(`model_select: model="${modelId}" resolved="${resolved}" current="${currentEmoteSet}"`);
    switchEmoteSetForModel(modelId);
  });

  pi.on("message_update", async (event) => {
    if (!widgetActive) return;
    if (event.message?.role !== "assistant") return;

    const streamEvent = event.assistantMessageEvent;
    if (!streamEvent) return;

    if (streamEvent.type === "thinking_start" || streamEvent.type === "thinking_delta") {
      if (animator.currentState !== "think") {
        animator.transitionTo("think");
      }
      return;
    }

    if (streamEvent.type === "toolcall_start") {
      const partial = streamEvent.partial;
      const block = partial?.content?.[streamEvent.contentIndex];
      if (block && "name" in block && block.name) {
        animator.transitionTo(toolNameToState(block.name));
      } else {
        animator.transitionTo("tool");
      }
      return;
    }

    if (streamEvent.type !== "text_delta") return;
    const text = streamEvent.delta;
    if (!text) return;

    // When TTS is enabled, skip streaming talk — let tts:start handle it.
    if (ttsModeEnabled) return;

    if (animator.currentState !== "talk") {
      animator.transitionTo("talk");
    }
    animator.onTalkToken(text);
  });

  pi.on("agent_end", async () => {
    if (!widgetActive) return;
    if (animator.currentState === "talk") {
      animator.endTalk();
    } else if (animator.currentState !== "idle" && animator.currentState !== "hi" && animator.currentState !== "compact") {
      animator.transitionTo("idle");
    }
  });

  pi.on("tool_execution_start", async (event) => {
    if (!widgetActive) return;
    animator.transitionTo(toolNameToState(event.toolName));
  });

  pi.on("tool_execution_end", async (event) => {
    if (!widgetActive) return;
    if (event.toolName === "bash" && event.isError) {
      animator.setHoldNextState("read");
      animator.transitionTo("failure");
    } else {
      animator.transitionTo("read");
    }
  });

  pi.on("session_before_compact", async () => {
    if (!widgetActive) return;
    animator.transitionTo("compact");
  });

  pi.on("session_compact", async () => {
    if (!widgetActive) return;
    animator.transitionTo("idle");
  });
}
