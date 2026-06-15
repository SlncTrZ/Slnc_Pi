export type EmoteState = "hi" | "idle" | "think" | "talk" | "read" | "write" | "tool" | "success" | "failure" | "compact";

export interface Config {
  enabled: boolean;
  debug: boolean;
  size: number;
  /** Grid size for image protocols (Kitty, Sixel, iTerm2). Defaults to `size` when not set. */
  imageSize?: number;
  /** Never hide the sprite, even on narrow terminals. Overrides `hideBelow`. */
  alwaysShow?: boolean;
  readingSpeed: number;
  hideBelow: number;
  holdDuration: { hi: number; success: number; failure: number };
  blinkInterval: [number, number];
  talkTickMs: number;
  cycleMs: number;
  emotes: EmoteMapping[];
  terminals: TerminalMapping[];
}

export interface EmoteMapping {
  model: string;
  "emote-set": string;
}

export interface TerminalMapping {
  match: string;
  render: "kitty" | "kitty-unicode" | "iterm2" | "sixel" | "ascii" | "auto";
}

export interface ResolvedRenderer {
  protocol: "kitty" | "kitty-unicode" | "iterm2" | "sixel" | "ascii";
  multiplexer: "tmux" | "screen" | "zellij" | null;
  warning: string | null;
  warningLevel: "warning" | "info";
}

export interface EmotesConfig {
  idle?: {
    default?: string;
    /** Single frame or 2-frame blink sequence [open, closed] */
    blink?: string | string[];
    /** Duration (ms) to hold the closed/blink frame (default 150) */
    blinkDuration?: number;
    /** Extra expression frames shown randomly during idle */
    expressions?: string[];
    /** Duration (ms) to hold expression frames (default 1000) */
    expressionDuration?: number;
  };
  think?: { default?: string; hard?: string };
  talk?: { weights?: Record<string, number> };
}

export interface FrameSet {
  files: string[];
  base64Cache: Map<string, string>;
}
