/**
 * clean-status — Hide or replace the built-in animated "Working..." spinner.
 *
 * Fixes two upstream pi-tui rendering artifacts that share the same root cause
 * (the spinner at line 0 updating every 80ms via setInterval):
 *
 * 1. Scrollback ghost-frame (badlogic/pi-mono#3083, closed without fix):
 *    When the live region grows taller than the terminal and auto-scrolls, the
 *    previous spinner frame is committed to scrollback where no escape sequence
 *    can reach it, leaving a frozen duplicate spinner above the live one.
 *
 * 2. Viewport jump-to-top during streaming (badlogic/pi-mono#1950):
 *    Each spinner tick changes line 0. Once streaming content pushes that line
 *    above the viewport, the diff sees firstChanged < viewportTop and fires
 *    fullRender(true), which emits \x1b[3J\x1b[2J\x1b[H (clear scrollback + clear
 *    screen + cursor home). The terminal viewport snaps back to the top and the
 *    user must scroll down to follow the answer. Upstream fix (isVolatile flag)
 *    is NOT bundled in pi-tui 0.80.3, so the spinner remains the trigger.
 *
 * This extension removes the source of both artifacts by disabling the animated
 * spinner. When the pi-emote extension is active (MeiLin avatar), the avatar
 * already reflects agent activity (think/talk/read/write/tool/idle/failure), so
 * the text spinner is redundant. A static-indicator fallback is available for
 * setups where pi-emote is disabled.
 *
 * Wing: pi-extensions | Topic: tui/clean-status | Updated: 2026-07-01
 */
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

/** Working spinner modes selectable via the --working-spinner CLI flag. */
type WorkingSpinnerMode = "hidden" | "static" | "default";

const FLAG_NAME = "working-spinner";
const DEFAULT_MODE: WorkingSpinnerMode = "hidden";

/**
 * Validate the flag value. Unknown values fall back to the default mode so a
 * typo never leaves the user with no status indicator at all.
 */
function coerceMode(value: string | boolean | undefined): WorkingSpinnerMode {
	if (value === "hidden" || value === "static" || value === "default")
		return value;
	return DEFAULT_MODE;
}

/**
 * Apply the selected spinner mode to the interactive UI.
 *
 * - "hidden": hide the built-in spinner entirely. Use when pi-emote (or another
 *   activity indicator) is active.
 * - "static": show a single non-animating bullet "● Working...". One frame
 *   means the upstream Loader's `restartAnimation()` early-returns, so no frame
 *   can ever leak into scrollback.
 * - "default": restore pi's built-in animated spinner (artifact-prone).
 */
function applyMode(ctx: ExtensionContext, mode: WorkingSpinnerMode): void {
	switch (mode) {
		case "hidden":
			ctx.ui.setWorkingVisible(false);
			return;
		case "static":
			ctx.ui.setWorkingVisible(true);
			// Single frame => no animation => no ghost frame to leak.
			ctx.ui.setWorkingIndicator({ frames: ["●"] });
			return;
		case "default":
		default:
			ctx.ui.setWorkingVisible(true);
			ctx.ui.setWorkingIndicator();
			return;
	}
}

export default function cleanStatusExtension(pi: ExtensionAPI): void {
	pi.registerFlag(FLAG_NAME, {
		description:
			"Working spinner mode: 'hidden' (default, rely on pi-emote avatar), 'static' (single bullet, no animation), 'default' (pi's built-in animated spinner)",
		type: "string",
		default: DEFAULT_MODE,
	});

	pi.on("session_start", (_event: SessionStartEvent, ctx: ExtensionContext) => {
		// session_start fires on startup, reload, new, resume, and fork — all the
		// points where the working indicator could be (re)initialized. Re-applying
		// is idempotent and keeps the mode sticky across /reload.
		const mode = coerceMode(pi.getFlag(FLAG_NAME));
		applyMode(ctx, mode);
	});
}
