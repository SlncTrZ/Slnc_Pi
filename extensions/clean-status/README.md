# clean-status

Hides or replaces pi's built-in animated `Working...` spinner to eliminate the
**scrollback ghost-frame artifact** (frozen duplicate spinner row above the live
one during long turns).

## Why

pi-tui's `WorkingStatusIndicator` animates braille spinner frames via
`setInterval(80ms)`. When the live region grows taller than the terminal window
and the terminal auto-scrolls, the previous frame is pushed into scrollback
where no escape sequence can reach it. Result: two visible spinners — one frozen
in scrollback, one animating below — plus a leftover frame after clean exit.

Tracked upstream as [badlogic/pi-mono#3083](https://github.com/badlogic/pi-mono/issues/3083),
currently closed without a fix.

This extension removes the source of the artifact. With the
[pi-emote](../pi-emote) extension active, the avatar already reflects agent
activity (think / talk / read / write / tool / idle / failure), so the text
spinner is redundant.

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

| Mode | Behavior | Use when |
|------|----------|----------|
| `hidden` | Hides the built-in spinner entirely | pi-emote (or another activity indicator) is active |
| `static` | Shows a single non-animating `● Working...` | pi-emote is off but you still want a status row |
| `default` | Restores pi's animated spinner | Debugging / comparing with upstream behavior |

The `static` mode works because pi-tui's `Loader.restartAnimation()` early-returns
when there is only one frame, so no frame can ever leak into scrollback.
