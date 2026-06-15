import type { TUI } from "@earendil-works/pi-tui";
import type { EmoteState, Config, EmotesConfig } from "./types.js";
import type { Renderer, RenderedFrame } from "./renderer.js";
import { log } from "./log.js";

// --- Helpers ---

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// --- Animator ---

export class Animator {
  // State machine
  currentState: EmoteState = "idle";

  // Renderer
  private renderer: Renderer;
  private config: Config;
  private emotesConfig: EmotesConfig = {};

  // Timers
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private blinkTimer: ReturnType<typeof setTimeout> | null = null;
  private expressionTimer: ReturnType<typeof setTimeout> | null = null;
  private talkTimer: ReturnType<typeof setInterval> | null = null;
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private thinkTimer: ReturnType<typeof setTimeout> | null = null;
  private talkGapTimer: ReturnType<typeof setTimeout> | null = null;
  private talkDurationTimer: ReturnType<typeof setTimeout> | null = null;

  // Cycle state
  private cycleIndex = 0;
  private cycleDirection = 1;

  // Hold state
  private holdNextState: EmoteState = "idle";

  // Talk state
  private talkWordCount = 0;
  private talkStartTime = 0;
  private lastTokenTime = 0;
  private talkMouthClosed = false;
  private ttsTalkActive = false;

  constructor(config: Config, renderer: Renderer) {
    this.config = config;
    this.renderer = renderer;
  }

  updateConfig(config: Config) {
    this.config = config;
  }

  setRenderer(renderer: Renderer) {
    this.renderer = renderer;
  }

  setTui(tui: TUI | null) {
    this.renderer.setTui(tui);
  }

  setEmotesConfig(emotesConfig: EmotesConfig) {
    this.emotesConfig = emotesConfig;
  }

  setHoldNextState(state: EmoteState) {
    this.holdNextState = state;
  }

  /** Get current rendered frame for the widget. */
  getRenderedFrame(): RenderedFrame | null {
    return this.renderer.getRenderedFrame();
  }

  resetRenderCache() {
    this.renderer.resetCache();
  }

  disposeRenderer() {
    this.renderer.dispose();
  }

  // --- Timer management ---

  clearAllTimers() {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
    if (this.blinkTimer) { clearTimeout(this.blinkTimer); this.blinkTimer = null; }
    if (this.talkTimer) { clearInterval(this.talkTimer); this.talkTimer = null; }
    if (this.cycleTimer) { clearInterval(this.cycleTimer); this.cycleTimer = null; }
    if (this.talkGapTimer) { clearTimeout(this.talkGapTimer); this.talkGapTimer = null; }
    if (this.talkDurationTimer) { clearTimeout(this.talkDurationTimer); this.talkDurationTimer = null; }
    if (this.thinkTimer) { clearTimeout(this.thinkTimer); this.thinkTimer = null; }
    if (this.expressionTimer) { clearTimeout(this.expressionTimer); this.expressionTimer = null; }
  }

  private clearStateTimers() {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
    if (this.talkTimer) { clearInterval(this.talkTimer); this.talkTimer = null; }
    if (this.cycleTimer) { clearInterval(this.cycleTimer); this.cycleTimer = null; }
    if (this.talkGapTimer) { clearTimeout(this.talkGapTimer); this.talkGapTimer = null; }
    if (this.talkDurationTimer) { clearTimeout(this.talkDurationTimer); this.talkDurationTimer = null; }
    if (this.thinkTimer) { clearTimeout(this.thinkTimer); this.thinkTimer = null; }
    if (this.expressionTimer) { clearTimeout(this.expressionTimer); this.expressionTimer = null; }
  }

  // --- State transitions ---

  transitionTo(state: EmoteState) {
    this.clearStateTimers();
    if (this.currentState === "idle") {
      if (this.blinkTimer) { clearTimeout(this.blinkTimer); this.blinkTimer = null; }
      if (this.expressionTimer) { clearTimeout(this.expressionTimer); this.expressionTimer = null; }
    }
    this.currentState = state;

    switch (state) {
      case "hi": this.enterHi(); break;
      case "idle": this.enterIdle(); break;
      case "think": this.enterThink(); break;
      case "talk": this.enterTalk(); break;
      case "read":
      case "write":
      case "tool": this.enterCycle(state); break;
      case "success": this.enterHold(state, this.config.holdDuration.success, this.holdNextState); this.holdNextState = "idle"; break;
      case "failure": this.enterHold(state, this.config.holdDuration.failure, this.holdNextState); this.holdNextState = "idle"; break;
      case "compact": this.enterCompact(); break;
    }
  }

  private enterHi() {
    this.renderer.showRandomFrame("hi");
    this.holdTimer = setTimeout(() => this.transitionTo("idle"), this.config.holdDuration.hi);
  }

  enterIdle() {
    const defaultFile = this.emotesConfig.idle?.default ?? null;
    if (defaultFile && this.renderer.showFrame("idle", defaultFile)) {
      // use configured default frame
    } else {
      this.renderer.showRandomFrame("idle");
    }
    this.scheduleBlink();
    this.scheduleExpression();
  }

  private scheduleBlink() {
    if (this.blinkTimer) { clearTimeout(this.blinkTimer); this.blinkTimer = null; }
    const delay = randomInRange(this.config.blinkInterval[0], this.config.blinkInterval[1]);
    this.blinkTimer = setTimeout(() => {
      if (this.currentState !== "idle") return;
      this.doBlink();
    }, delay);
  }

  /**
   * Execute blink animation.
   * - If blink is a 2-element array [open, closed]: play sequence open→closed→default
   * - If blink is a string: show that single frame then return to default
   * - If blink is null: showRandomFrame
   */
  private doBlink() {
    const blinkCfg = this.emotesConfig.idle?.blink ?? null;
    const blinkDuration = this.emotesConfig.idle?.blinkDuration ?? 150;
    const defaultFile = this.emotesConfig.idle?.default ?? null;

    // Blink sequence: [open, closed]
    if (Array.isArray(blinkCfg) && blinkCfg.length >= 2) {
      const openFile = blinkCfg[0]!;
      const closeFile = blinkCfg[1]!;
      if (!this.renderer.showFrame("idle", openFile)) {
        this.scheduleBlink();
        return;
      }
      // Show closed frame after blinkDuration, then return to default
      setTimeout(() => {
        if (this.currentState !== "idle") return;
        this.renderer.showFrame("idle", closeFile, true);
        setTimeout(() => {
          if (this.currentState !== "idle") return;
          if (defaultFile) {
            this.renderer.showFrame("idle", defaultFile, true);
          } else {
            this.renderer.showRandomFrame("idle", true);
          }
          this.scheduleBlink();
        }, blinkDuration);
      }, blinkDuration);
      return;
    }

    // Single blink frame (backward compat)
    const blinkFile = typeof blinkCfg === "string" ? blinkCfg : null;
    let blinked = false;
    if (blinkFile) {
      blinked = this.renderer.showFrame("idle", blinkFile);
    } else {
      blinked = this.renderer.showRandomFrame("idle");
    }
    if (!blinked) {
      this.scheduleBlink();
      return;
    }

    const doubleBlink = Math.random() < 0.15;

    setTimeout(() => {
      if (this.currentState !== "idle") return;
      if (defaultFile) {
        this.renderer.showFrame("idle", defaultFile, true);
      } else {
        this.renderer.showRandomFrame("idle", true);
      }

      if (doubleBlink) {
        setTimeout(() => {
          if (this.currentState !== "idle") return;
          if (blinkFile) {
            this.renderer.showFrame("idle", blinkFile, true);
          } else {
            this.renderer.showRandomFrame("idle", true);
          }
          setTimeout(() => {
            if (this.currentState !== "idle") return;
            if (defaultFile) {
              this.renderer.showFrame("idle", defaultFile, true);
            } else {
              this.renderer.showRandomFrame("idle", true);
            }
            this.scheduleBlink();
          }, blinkDuration);
        }, 100);
      } else {
        this.scheduleBlink();
      }
    }, blinkDuration);
  }
  /** Schedule a random idle expression (e.g. idle3/idle5/idle6). */
  private scheduleExpression() {
    if (this.expressionTimer) { clearTimeout(this.expressionTimer); this.expressionTimer = null; }
    const expressions = this.emotesConfig.idle?.expressions;
    if (!expressions || expressions.length === 0) return;
    const delay = randomInRange(this.config.blinkInterval[0], this.config.blinkInterval[1]);
    this.expressionTimer = setTimeout(() => {
      if (this.currentState !== "idle") return;
      this.doExpression();
    }, delay);
  }

  /** Show a random expression, hold it, then return to default. */
  private doExpression() {
    const expressions = this.emotesConfig.idle?.expressions;
    if (!expressions || expressions.length === 0) { this.scheduleExpression(); return; }
    const exprDuration = this.emotesConfig.idle?.expressionDuration ?? 1000;
    const defaultFile = this.emotesConfig.idle?.default ?? null;
    const exprFile = expressions[Math.floor(Math.random() * expressions.length)]!;

    if (!this.renderer.showFrame("idle", exprFile)) {
      this.scheduleExpression();
      return;
    }

    setTimeout(() => {
      if (this.currentState !== "idle") return;
      if (defaultFile) {
        this.renderer.showFrame("idle", defaultFile, true);
      } else {
        this.renderer.showRandomFrame("idle", true);
      }
      this.scheduleExpression();
    }, exprDuration);
  }

  private enterThink() {
    const defaultFile = this.emotesConfig.think?.default ?? null;
    if (defaultFile && this.renderer.showFrame("think", defaultFile)) {
      // use configured default frame
    } else {
      this.renderer.showRandomFrame("think");
    }
    this.scheduleThinkSwap();
  }

  private scheduleThinkSwap() {
    if (this.thinkTimer) { clearTimeout(this.thinkTimer); this.thinkTimer = null; }
    const delay = randomInRange(this.config.blinkInterval[0], this.config.blinkInterval[1]);
    this.thinkTimer = setTimeout(() => {
      if (this.currentState !== "think") return;
      this.doThinkSwap();
    }, delay);
  }

  private doThinkSwap() {
    const hardFile = this.emotesConfig.think?.hard ?? null;
    let swapped = false;
    if (hardFile) {
      swapped = this.renderer.showFrame("think", hardFile, true);
    } else {
      swapped = this.renderer.showRandomFrame("think", true);
    }
    if (!swapped) {
      this.scheduleThinkSwap();
      return;
    }

    const defaultFile = this.emotesConfig.think?.default ?? null;
    setTimeout(() => {
      if (this.currentState !== "think") return;
      if (defaultFile) {
        this.renderer.showFrame("think", defaultFile, true);
      } else {
        this.renderer.showRandomFrame("think", true);
      }
      this.scheduleThinkSwap();
    }, 800);
  }

  private enterTalk() {
    this.talkWordCount = 0;
    this.talkStartTime = Date.now();
    this.lastTokenTime = Date.now();
    this.talkMouthClosed = false;

    this.renderer.showTalkFrame(this.emotesConfig);

    this.talkTimer = setInterval(() => {
      if (this.currentState !== "talk") return;
      if (this.ttsTalkActive) {
        // Steady rhythmic mouth animation during TTS playback
        this.talkMouthClosed = !this.talkMouthClosed;
      }
      if (this.talkMouthClosed) {
        this.renderer.showTalkCloseFrame();
      } else {
        this.renderer.showTalkFrame(this.emotesConfig);
      }
    }, this.config.talkTickMs);
  }

  onTalkToken(text: string) {
    if (this.currentState !== "talk") return;
    if (this.ttsTalkActive) return; // TTS drives animation, ignore tokens

    const words = text.split(/\s+/).filter((w) => w.length > 0).length;
    this.talkWordCount += words;
    this.lastTokenTime = Date.now();

    if (this.talkMouthClosed) {
      this.talkMouthClosed = false;
    }

    if (this.talkGapTimer) { clearTimeout(this.talkGapTimer); this.talkGapTimer = null; }
    this.talkGapTimer = setTimeout(() => {
      if (this.currentState !== "talk") return;
      this.talkMouthClosed = true;
    }, 200);

    this.recalculateTalkDuration();
  }

  private recalculateTalkDuration() {
    if (this.talkDurationTimer) { clearTimeout(this.talkDurationTimer); this.talkDurationTimer = null; }

    const targetDurationMs = (this.talkWordCount / this.config.readingSpeed) * 1000;
    const elapsed = Date.now() - this.talkStartTime;
    const remaining = Math.max(0, targetDurationMs - elapsed);

    this.talkDurationTimer = setTimeout(() => {
      if (this.currentState !== "talk") return;
      const timeSinceLastToken = Date.now() - this.lastTokenTime;
      if (timeSinceLastToken > 200) {
        this.transitionTo("idle");
      } else {
        this.talkDurationTimer = setTimeout(() => {
          if (this.currentState === "talk") this.transitionTo("idle");
        }, 200);
      }
    }, remaining);
  }

  endTalk() {
    if (this.currentState !== "talk") return;
    if (this.ttsTalkActive) return; // TTS owns talk state, wait for tts:end
    // No TTS — go idle immediately when streaming finishes
    this.transitionTo("idle");
  }

  /** Enter talk for TTS playback (called from tts:start event) */
  enterTtsTalk() {
    this.ttsTalkActive = true;
    this.talkMouthClosed = false;
    if (this.currentState !== "talk") {
      this.transitionTo("talk");
    }
  }

  /** Exit talk after TTS playback (called from tts:end event) */
  exitTtsTalk() {
    this.ttsTalkActive = false;
    if (this.currentState === "talk") {
      this.transitionTo("idle");
    }
  }

  private enterCycle(state: EmoteState) {
    this.cycleIndex = 0;
    this.cycleDirection = 1;
    this.renderer.showCycleFrame(state, 0);

    const count = this.renderer.getCycleFrameCount(state);
    if (count <= 1) return;

    this.cycleTimer = setInterval(() => {
      if (this.currentState !== state) return;
      this.cycleIndex += this.cycleDirection;
      if (this.cycleIndex >= count - 1) this.cycleDirection = -1;
      if (this.cycleIndex <= 0) this.cycleDirection = 1;
      this.renderer.showCycleFrame(state, this.cycleIndex);
    }, this.config.cycleMs);
  }

  private enterHold(state: EmoteState, duration: number, nextState: EmoteState = "idle") {
    this.renderer.showRandomFrame(state);
    this.holdTimer = setTimeout(() => this.transitionTo(nextState), duration);
  }

  private enterCompact() {
    this.renderer.showRandomFrame("compact");
  }
}
