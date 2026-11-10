<p align="center">
  <a href="https://wakatime.com">
    <img src="assets/wakatime-logo.svg" alt="WakaTime Logo" width="120" />
  </a>
</p>

# WakaTime for Pi & Oh-My-Pi

[![npm version](https://img.shields.io/npm/v/waka-pi.svg)](https://www.npmjs.com/package/waka-pi)
[![CI](https://github.com/mbayue/waka-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/mbayue/waka-pi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Track AI-assisted coding activity, file modifications, sessions, and token metrics from [Pi](https://pi.dev) and [Oh-My-Pi](https://omp.sh) with [WakaTime](https://wakatime.com/).

---

## Installation

### In Oh-My-Pi (`omp`)

Install directly via the `omp` CLI:

```bash
# From npm
omp plugin install waka-pi
# or shorthand:
omp install waka-pi

# Directly from GitHub repository
omp plugin install github:mbayue/waka-pi

# Or link a local working directory for development
omp plugin link /path/to/waka-pi
```

Alternatively, add `waka-pi` to your `.omp/settings.json`:

```json
{
  "extensions": [
    "waka-pi"
  ]
}
```

Or run a single test session using the `-e` flag:

```bash
omp -e /path/to/waka-pi
```

---

### In Pi (`pi`)

Install directly via the `pi` CLI:

```bash
# From npm
pi install npm:waka-pi

# Directly from GitHub repository
pi install git:github.com/mbayue/waka-pi
```

Alternatively, add `waka-pi` to your `~/.pi/agent/settings.json` or project `.pi/settings.json`:

```json
{
  "extensions": [
    "waka-pi"
  ]
}
```

---

### API Key Configuration

Add your [WakaTime API key](https://wakatime.com/api-key) to `~/.wakatime.cfg` (or `$WAKATIME_HOME/.wakatime.cfg`):

```ini
[settings]
api_key = your-api-key
```

The plugin automatically manages and downloads `wakatime-cli` into `~/.wakatime/`. No global npm install or manual binary setup is required.

---

## What is tracked

Like the official [Claude Code](https://github.com/wakatime/claude-code-wakatime), [OpenCode](https://github.com/wakatime/opencode-wakatime), and [Codex CLI](https://github.com/wakatime/codex-cli-wakatime) plugins, this extension delegates session parsing, metrics computation, and delivery to the official [wakatime-cli](https://github.com/wakatime/wakatime-cli).

- **File modifications**: Creation, edits, and updates from tool executions (`write`, `edit`, `apply_patch`, `str_replace`, `multi_edit`, `insert`).
- **Real-time file heartbeats**: Emits direct file-write heartbeats labeled with category `"ai coding"`, pinpointing the exact project file and programming language.
- **Transcript activity sync**: Uses `wakatime-cli --sync-ai-activity` to parse session transcripts for duration, turns, and token changes without transmitting private prompt contents.
- **Sequential command queue**: Sync operations are queued and coalesced to avoid concurrent child process collisions or SQLite/Bolt database locking on local offline queues.
- **Offline resilience**: Network drops are handled gracefully by `wakatime-cli`, which queues heartbeats locally in `~/.wakatime/offline_heartbeats.bdb` and flushes them when connectivity resumes.

---

## Slash Commands & Diagnostic CLI

### Inside an Active Session

Use the `/wakatime` slash command in your agent TUI:

- `/wakatime status` — Displays runtime engine (Pi vs OMP), CLI version, configured paths, and API key status.
- `/wakatime sync` — Manually triggers an immediate background activity sync.
- `/wakatime update` (or `/wakatime install`) — Downloads or updates `wakatime-cli`.
- `/wakatime log` — Views the last 20 lines of `~/.wakatime/waka-pi.log`.

### From Terminal (CLI)

Run diagnostic or maintenance tasks directly from your terminal using `npx`:

```bash
# Check status and configuration
npx waka-pi --status

# Trigger an immediate sync for a specific workspace
npx waka-pi --sync /path/to/project

# Download or update wakatime-cli binary
npx waka-pi --install
```

*(During local development, you can also run `node ./bin/waka-pi.js --status`)*

---

## Configuration and Troubleshooting

Standard `~/.wakatime.cfg` settings are respected:

- **Debug logging**: Add `debug = true` under `[settings]` in `~/.wakatime.cfg`.
- **Proxy**: Set `proxy = https://user:pass@proxy.corp:8080`.
- **Self-signed certificates**: Set `no_ssl_verify = true` under `[settings]`.
- **Alternate home directory**: Set the `WAKATIME_HOME` environment variable to use an alternate root containing `.wakatime.cfg` and `.wakatime/`.

### Log Locations:
- **Plugin logs**: `~/.wakatime/waka-pi.log`
- **CLI logs**: `~/.wakatime/wakatime.log`

---

## Development

```bash
# Install development dependencies
bun install
# or: npm install

# Build TypeScript to ./dist
bun run build
# or: npm run build

# Run unit tests
bun test
# or: npm test
```

---

## License

MIT
