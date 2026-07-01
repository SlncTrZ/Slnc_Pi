# clean-status

Hides or replaces pi's built-in animated `Working...` spinner to eliminate two
related **rendering artifacts** that share the same root cause (the spinner at
line 0 ticking every 80ms):

1. **Scrollback ghost-frame** — a frozen duplicate `Working...` spinner appears
   above the live one during long turns.
2. **Viewport jump-to-top** — during streaming, the terminal viewport suddenly
   snaps back to the top of the window, so you have to scroll down to read the
   answer MeiLin is writing.

## Why

pi-tui's `WorkingStatusIndicator` animates braille spinner frames via
`setInterval(80ms)`. When the live region grows taller than the terminal window and the terminal
auto-scrolls:

- The previous spinner frame is pushed into scrollback where no escape sequence
  can reach it → frozen duplicate spinner (upstream
  [badlogic/pi-mono#3083](https://github.com/badlogic/pi-mono/issues/3083),
  closed without fix).
- Each spinner tick changes line 0. Once that line is pushed above the viewport,
  the renderer's diff sees `firstChanged < viewportTop` and fires
  `fullRender(true)`, emitting `\x1b[3J\x1b[2J\x1b[H` (clear scrollback + clear
  screen + cursor home) → viewport snaps to top (upstream
  [badlogic/pi-mono#1950](https://github.com/badlogic/pi-mono/issues/1950)).
  The upstream fix (an `isVolatile` component flag) is **not bundled** in
  pi-tui 0.80.3, so the spinner remains the trigger.

This extension removes the source of both artifacts by disabling the animated
spinner. With the [pi-emote](../pi-emote) extension active, the avatar already
reflects agent activity (think / talk / read / write / tool / idle / failure), so
the text spinner is redundant.

## Usage

Active by default (`--working-spinner hidden`) whenever pi-emote is installed.
Override per-launch:

```bash
pi --working-spinner hidden    # hide spinner, rely on pi-emote avatar (default)
pi --working-spinner static    # single "● Working..." bullet, no animation
pi --working-spinner default   # restore pi's built-in animated spinner
```

The mode is re-applied on every `session_start` (startup, `/reload`, new,
resume, fork), so it survives reloads without re-typing the flag.

## Modes

| Mode | Behavior | Fixes | Use when |
|------|----------|-------|----------|
| `hidden` | Hides the built-in spinner entirely | ghost-frame **and** viewport jump | pi-emote (or another activity indicator) is active |
| `static` | Shows a single non-animating `● Working...` | ghost-frame **and** viewport jump | pi-emote is off but you still want a status row |
| `default` | Restores pi's animated spinner | (none — upstream behavior) | Debugging / comparing with upstream behavior |

The `static` mode works because pi-tui's `Loader.restartAnimation()` early-returns
when there is only one frame, so no frame can ever leak into scrollback.
