# Patchwork

**English** | [Русский](README.ru.md)

A local diff viewer for Windows and macOS. Your agent writes the code; you review the changes and send specific feedback through MCP.

## Features

- Changed-file explorer with `+N / −M` counts, filtering, tabs and a resizable sidebar. **Files** is the default view; **Folders / Files** switches between a folder tree and a flat list. The arrow next to **Changes** folds the entire section; the button beside the view switch folds all folders. The layout and section state are saved.
- Agent-guided review order: numbered steps follow the execution flow across files, with Start / Previous / Next navigation. Priority is a compact icon, not a section. An overall flow summary and per-file explanations appear in the user's language beside the code. Each suggestion shows its author and validation checks; files changed since the assessment are marked. Numbered steps stay in sequence even in Folders view.
- On Windows the app header is the draggable titlebar, with minimize, maximize / restore and close controls. Double-click its empty area or branding to maximize / restore. Appearance and keyboard shortcuts are in Settings; the left rail contains Files, Review and MCP.
- Split and unified diffs, word-level change highlighting, expandable context, word wrap and search.
- Full-file view with additions and deletions highlighted, including removed lines for context.
- PNG, JPG/JPEG and WebP previews: original and modified images side by side or stacked, Full file view, transparency, dimensions and file size, Fit / 100%, and zoom from 25–400%.
- Working-tree changes against HEAD, staged changes, and comparisons with local or remote branches from their common ancestor, including current local edits.
- Added, deleted and renamed files, and repositories without an initial commit.
- Reviewed markers that reset automatically when a file's version changes.
- Comments on the original or modified side, reviews saved locally, and feedback you can copy for your agent.
- Stage / unstage individual files, stage all changes, and commit staged files. Regular Git hooks and commit-signing settings apply.
- Four themes, adjustable font size, keyboard shortcuts, a command palette and saved preferences.
- MCP over stdio, with the same executable serving as both the desktop app and MCP bridge. The installed app does not require Node.js.

## Getting started

The installed app requires Git on your PATH. Windows uses the system WebView2 runtime; macOS uses WKWebView. The app is built with [Tauri 2](https://v2.tauri.app/start/).

A local Windows build produces `src-tauri/target/release/patchwork.exe`.

For development, install Node.js 22+, stable Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/): MSVC Build Tools on Windows or Xcode Command Line Tools on macOS.

```sh
npm ci
npm run desktop
```

To run the interactive browser demo:

```sh
npm run dev
```

Open `http://127.0.0.1:1420`. The UI labels this as a demo workspace. It uses sample files, cannot read local repositories and does not create real commits.

## MCP

Open Patchwork, click **Connect agent**, select Codex, Claude Desktop or Cursor, and copy the configuration containing the exact executable path. Restart your agent's MCP connection; the connected agent will then appear in Patchwork.

For Codex, add the following to `~/.codex/config.toml` ([official documentation](https://developers.openai.com/codex/mcp/)):

```toml
[mcp_servers.patchwork]
command = "C:\\path\\to\\patchwork.exe"
args = ["--mcp"]
```

On macOS, use the executable inside the app bundle: `/Applications/Patchwork.app/Contents/MacOS/patchwork`. Patchwork's connection panel automatically shows the actual executable path.

Cursor uses `~/.cursor/mcp.json`; Claude Desktop uses `claude_desktop_config.json`. Add Patchwork to the existing `mcpServers` object, keeping your other servers.

```json
{
  "mcpServers": {
    "patchwork": {
      "command": "/absolute/path/to/patchwork",
      "args": ["--mcp"]
    }
  }
}
```

| Tool | What it does |
| --- | --- |
| `open_repository` | Opens a Git repository by absolute path |
| `list_changes` | Lists changed files, line counts and staging state |
| `get_diff` | Returns a unified patch and original/modified contents |
| `get_file` | Reads complete original/modified contents |
| `show_diff` | Focuses the app and selects a file, line and view mode |
| `get_review` | Reads priorities, reviewed markers and human comments |
| `add_comment` | Adds a note to a file and line |
| `set_review_plan` | Sets review order, priorities and reasons |

Example instruction for your agent:

> Open /path/to/repo in Patchwork and compare with main. Read the code and use set_review_plan to explain the overall task and flow, then number every changed file in execution order: entry point, called functions, downstream effects, tests. Set priorities separately. For each file, explain what it does, its connection to the next step, and what to check. Write all summaries and reasons in my language. Use show_diff to open step 1. After my review, read get_review and address the feedback.

Example `set_review_plan` arguments:

```json
{
  "base": "main",
  "summary": "The request enters the API handler, which checks authorization and calls the service to save the result.",
  "files": [
    { "path": "src/api.ts", "priority": "validate", "order": 1, "summary": "The handler validates the request and passes it to service.ts.", "reason": "Check authorization and invalid input handling." },
    { "path": "src/service.ts", "priority": "normal", "order": 2, "summary": "The service saves the result and returns it to the handler.", "reason": "Check downstream effects and error propagation." },
    { "path": "README.md", "priority": "low", "order": 3, "summary": "Documents how to start and use the new flow.", "reason": "Verify that the instructions match the code." }
  ]
}
```

Priorities are `validate`, `normal` and `low`. The list replaces the previous plan for this repository/comparison pair; files outside the plan keep normal priority. An empty `files` array clears the plan. Every listed file must be present in `list_changes` for the selected comparison. The plan contains agent suggestions; the human sets reviewed markers.

`order` is optional: a unique integer from 1 to 1000. Numbered files come first, regardless of priority. Gaps are allowed; filtering or removing a file does not renumber the remaining steps. File paths must also be unique. Unnumbered files use priority sorting, with no priority section headings. Invalid plans are rejected as a whole. Existing saved reviews remain compatible. Restart the app and reconnect the agent after upgrading so it receives the updated MCP tool schema and instructions.

Top-level `summary` describes the whole flow; each file's `summary` explains its role and changes (up to 12,000 UTF-8 bytes each). `reason` lists what the human should validate (up to 4,000 bytes). These fields contain plain text in the user's language, written by the connected agent after reading the code. They are optional for older clients; a new handoff should explain and number every changed file. Updating a plan replaces its summary as well; omitting it removes the old summary, and clearing the plan clears it too.

The transport is [MCP stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports). The internal bridge listens only on loopback, uses a random port and requires a local random token. This port is not a public MCP HTTP endpoint. MCP tools do not edit source files or create commits; Git writes are available through human actions in the UI.

## Building and testing

```sh
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri -- build --no-bundle
node scripts/smoke-mcp.mjs
```

The smoke test launches the real desktop app and MCP process. It checks the handshake, all eight tools, priorities and line counts, diff navigation, comments, persistence and file-access boundaries. It uses a separate test repository and data under `.qa/`.

To measure file-read latency against a fixture with 501 changed files, run `node scripts/benchmark-mcp.mjs /path/to/patchwork`. Multiple executable arguments compare builds on the same fixture. The script reports ten warmed backend reads; it does not measure UI rendering, total memory or cold startup. `PATCHWORK_BENCHMARK_BRIDGE` can point to a common current executable when comparing older MCP transports.

Build a Windows installer:

```sh
npm run tauri -- build --bundles nsis
```

Build the macOS app and disk image on a Mac:

```sh
npm run tauri -- build --bundles app,dmg
```

`.github/workflows/build.yml` builds Windows x64, macOS Apple Silicon and macOS Intel bundles separately. It uploads artifacts without publishing releases. The macOS app still needs runtime testing on a Mac. Apple Developer signing and notarization for public distribution are not configured; CI uses ad-hoc signing.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd K or P | Find a file or run a command |
| Ctrl/Cmd O | Open a repository |
| Ctrl/Cmd B | Toggle the file explorer |
| Ctrl/Cmd F | Find in the current file |
| Ctrl/Cmd Shift F | Filter changed files |
| Ctrl/Cmd Shift R | Refresh changes |
| Ctrl/Cmd , | Open settings |
| Ctrl/Cmd Enter | Open the commit dialog; submit a commit from the message field |
| J / K | Next / previous file |
| Alt ↓ / Alt ↑ | Next / previous change |
| D | Toggle Diff / Full file |
| R | Toggle the reviewed marker |

## Local data and limits

Comments and reviews are saved in `%APPDATA%/Patchwork` on Windows and `~/Library/Application Support/Patchwork` on macOS. Themes and preferences use the WebView's local storage. Set `PATCHWORK_DATA_DIR` for a separate or portable profile; pass the same environment variable to the MCP process.

Text previews are limited to 2 MB per side; PNG/JPEG/WebP previews allow up to 20 MB per side. Images are read locally and sent to the UI. MCP `get_file` remains text-only and does not send image base64 to your agent. Other binary files and non-UTF-8 files display a separate state instead of being rendered as code. Long diffs are virtualized, and diff calculation has a time limit. Syntax highlighting uses a lightweight tokenizer without a language server. Git state refreshes every four seconds while the app is visible; file contents reload when their version changes.

Patchwork does not send your code to the cloud. A connected agent receives content only through explicitly invoked MCP tools.
