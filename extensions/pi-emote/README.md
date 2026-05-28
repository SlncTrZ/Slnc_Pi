# CGx's pi-emote
> This is sourced from: https://github.com/cgxeiji/pi-emote

> **Currently looking to expand the emotes gallery!** If you have an emote set you'd like to submit, please make a PR!

Animated pixel-art emote that lives in the top-right corner of your pi TUI session. Reacts to what the agent is doing — thinking, talking, reading, writing, using tools, etc.

![pi-emote demo](pi-emote-demo.gif)

Supports Kitty, iTerm2, Sixel, and ASCII rendering.

## Gallery

Community-contributed emote sets. [Submit yours via PR!](#custom-emotes)

### Image Sets

| Avatar | Name | Contributor |
|--------|------|-------------|
| <img src="emotes/default/hi/hi1.png" width="64"> | `default` | [@cgxeiji](https://github.com/cgxeiji) |
| <img src="emotes/aza_choi/hi/hi_1.png" width="64"> | `aza_choi` | [@shennguyenrs](https://github.com/shennguyenrs) |
| <img src="emotes/aza_choi_nobg/hi/hi_1.png" width="64"> | `aza_choi_nobg` | [@shennguyenrs](https://github.com/shennguyenrs) |

### ASCII Sets

| Avatar | Name | Contributor |
|--------|------|-------------|
| `(^ ◡ ^)/` | `ascii` | [@cgxeiji](https://github.com/cgxeiji) |
| `ʕ•̫͡•ʔ` | `ascii-bear` | [@LCorleone](https://github.com/LCorleone) |

## Install

```bash
pi install git:github.com/cgxeiji/pi-emote
```

## Windows Setup

For Windows, the recommended setup is to run pi in **Windows Terminal** and let pi-emote use the Sixel renderer through Chafa.

### Recommended: Windows Terminal + Chafa

1. Install Chafa:

```powershell
winget install hpjansson.Chafa
```

2. Open **Windows Terminal**. Confirm it is actually Windows Terminal:

```powershell
$env:WT_SESSION
```

If this prints a value, pi-emote will auto-detect Windows Terminal and use:

```json
{ "match": "windows-terminal", "render": "sixel" }
```

3. Start or reload pi:

```text
/reload
```

If Chafa is installed somewhere unusual, point pi-emote at it explicitly:

```powershell
$env:PI_EMOTE_CHAFA_PATH="C:\path\to\Chafa.exe"
```

### VS Code Integrated Terminal

VS Code's integrated terminal is **not Windows Terminal**, even when it uses PowerShell. It reports:

```powershell
$env:TERM_PROGRAM
# vscode
$env:WT_SESSION
# empty
```

pi-emote can try VS Code's Kitty graphics path if image support is enabled:

```json
"terminal.integrated.enableImages": true,
"terminal.integrated.gpuAcceleration": "on",
"terminal.integrated.windowsUseConptyDll": true
```

However, this path is currently experimental. VS Code may render a grey/checkerboard image-placement artifact around the sprite. The external Windows Terminal + Chafa path is the stable Windows option.

## States

| State | Trigger |
|-------|---------|
| hi | Session start |
| idle | Nothing happening (blinks occasionally) |
| think | Reasoning tokens streaming |
| talk | Text response streaming |
| read | `read` tool / reading tool output |
| write | `write` or `edit` tool |
| tool | Any other tool |
| success | Successful tool execution |
| failure | Failed tool execution |
| compact | Context compaction |

## Config

Drop a `config.json` in one of these paths (highest priority wins):

- `~/.pi/agent/extensions/pi-emote/config.json` — your global prefs
- `.pi/extensions/pi-emote/config.json` — project override

Only include what you want to change:

```json
{
  "size": 12,
  "emotes": [
    { "model": "*claude*", "emote-set": "my-avatar" }
  ]
}
```

See `config.json` in the extension root for all defaults.

### Slash Command

Use `/emote` inside pi to inspect or change the default face set:

```text
/emote list
/emote set aza_choi_nobg
```

`/emote set` autocompletes available emote set names from extension, user, and project emote folders. It saves the selected default to `~/.pi/agent/extensions/pi-emote/config.json` and applies it immediately in the current session.

## Supported Terminals

pi-emote uses terminal-specific image protocols to render the sprite. The correct renderer is auto-detected based on your environment, but some terminals require specific setup:

### Windows Terminal (Sixel via Chafa)

Windows Terminal supports the Sixel protocol, but pi-emote uses the [Chafa CLI](https://hpjansson.org/chafa/) as a bridge to generate the Sixel DCS sequences.

**Prerequisites:**
Install Chafa (e.g., via Winget):
```powershell
winget install hpjansson.Chafa
```

**How it works:**
- When pi-emote detects `WT_SESSION`, it automatically maps to the `sixel` renderer.
- Chafa converts the PNG frames into Sixel escape sequences.
- The output is wrapped in cursor save/restore codes (`ESC 7` / `ESC 8`) to prevent the TUI layout from drifting as the sprite animates.
- Chafa is constrained to the sprite's allocated rows/columns so it aligns perfectly in the avatar corner.

If Chafa isn't found in your PATH, you can set its location via environment variable:
```powershell
$env:PI_EMOTE_CHAFA_PATH="C:\path\to\Chafa.exe"
```

### VS Code Integrated Terminal (Kitty Graphics, Experimental)

As of VS Code v1.110, the integrated terminal supports the Kitty graphics protocol natively on Windows via ConPTY v2. pi-emote can target this path so the sprite stays docked inside VS Code instead of requiring an external Windows Terminal window.

Because the core `pi-tui` library historically marks VS Code as `images: null`, pi-emote explicitly overrides this and maps VS Code to the `kitty` renderer:

```json
{ "match": "vscode", "render": "kitty" }
```

To enable VS Code's image renderer, add these settings to your VS Code `settings.json`:

```json
"terminal.integrated.enableImages": true,
"terminal.integrated.gpuAcceleration": "on",
"terminal.integrated.windowsUseConptyDll": true
```

Then reload VS Code or close and reopen the integrated terminal before launching pi.

**Known issue:** VS Code's current Kitty image path is usable but visually bugged for pi-emote. The sprite stays spatially stable, but VS Code may render a grey/checkerboard image-placement area around the avatar that can overlap nearby terminal content. The iTerm inline image protocol was also tried for VS Code, but it caused cursor/layout drift and is not recommended. For the cleanest Windows experience, use Windows Terminal with the Sixel/Chafa path above.

### Manual Terminal Overrides

You can force a specific renderer for any terminal in your user or project config:

```json
{
  "terminals": [
    { "match": "vscode", "render": "kitty" },
    { "match": "windows-terminal", "render": "sixel" },
    { "match": "ghostty", "render": "kitty" }
  ]
}
```

Available render values: `"kitty"`, `"kitty-unicode"`, `"iterm2"`, `"sixel"`, `"ascii"`, `"auto"`.

## Multiplexers

pi-emote can render image avatars through **tmux** using DCS passthrough. When tmux is detected, pi-emote auto-detects the outer terminal and picks the right image protocol.

### tmux Setup

Add these to your `tmux.conf`:

```bash
# Required — allow image sequences to pass through to the outer terminal
set -g allow-passthrough on

# Required — detect outer terminal when attaching from a different terminal
set -ga update-environment TERM
set -ga update-environment TERM_PROGRAM

# Recommended — reduces flicker during animation
set -sg escape-time 0
```

Then restart tmux completely:

```bash
tmux kill-server && tmux
```

Without `allow-passthrough`, pi-emote defaults to ASCII and shows a one-time warning with setup instructions.

### Experimental Multiplexer Support

| Outer Terminal | Protocol | Status |
|----------------|----------|--------|
| Ghostty | kitty-unicode | ✅ Stable, pane-safe, auto-detected |
| kitty | kitty-unicode | ⚠️ Untested, pane-safe, auto-detected |
| iTerm2 | iterm2 | ⚠️ Experimental, opt-in only (pane bleed in multi-pane layouts) |
| WezTerm | iterm2 | ⚠️ Experimental, opt-in only (not verified) |

The outer terminal is detected via `tmux show-environment TERM_PROGRAM`, which reflects the currently attached terminal.

Ghostty and kitty use the **kitty-unicode** renderer (Unicode placeholders) which is pane-safe — images stay within their pane and clean up on session switch. This is the default when auto-detected.

iTerm2 and WezTerm use DCS passthrough for the iTerm2 image protocol. This works but has known limitations: images can bleed into adjacent panes and persist when switching sessions. **Not enabled by default** — opt in explicitly:

```json
{
  "terminals": [
    { "match": "tmux", "render": "iterm2" }
  ]
}
```

### Other Multiplexers

**zellij** and **screen** are not yet supported and default to ASCII.

### Manual Override

Force a specific renderer:

```json
{
  "terminals": [
    { "match": "tmux", "render": "kitty-unicode" }
  ]
}
```

Available render values for tmux: `"auto"`, `"kitty-unicode"`, `"kitty"`, `"iterm2"`, `"ascii"`.

- `"auto"` — detect outer terminal; uses kitty-unicode for Ghostty/kitty, ASCII for others
- `"kitty-unicode"` — pane-safe Unicode placeholders (Ghostty, kitty)
- `"kitty"` — classic DCS passthrough (single-pane only, experimental)
- `"iterm2"` — iTerm2 DCS passthrough (single-pane only, experimental)
- `"ascii"` — text fallback

## Custom Emotes

Emote sets live in `emotes/<set-name>/` with PNG frames per state:

```
emotes/my-avatar/
├── idle/*.png
├── think/*.png
├── talk/*.png
├── read/*.png
├── write/*.png
├── tool/*.png
└── ...          # hi, success, failure, compact
```

Not all states are required. Missing ones just won't animate.

### Where to put them

pi-emote searches in order:

1. `.pi/extensions/pi-emote/emotes/<name>/` (project)
2. `~/.pi/agent/extensions/pi-emote/emotes/<name>/` (user)
3. Extension built-in → falls back to `default`

### Map models to sets

Glob patterns against model ID, last match wins:

```json
{
  "emotes": [
    { "model": "*", "emote-set": "default" },
    { "model": "*claude*", "emote-set": "my-avatar" },
    { "model": "*haiku*", "emote-set": "haiku-avatar" }
  ]
}
```

In this example, `claude` models use `my-avatar`, but `haiku` ones use `haiku-avatar`.
See `emotes/default/emotes.json` for per-set frame config (blink frames, talk weights).

## License

MIT
