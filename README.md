# Illustrator MCP

An open-source Illustrator MCP combining mature capabilities from IE3JP,
Alexander Ladygin, and Creold/Sergey Osokin, plus DPM production safety.

## Features

- 74 public Illustrator Core tools: 67 IE3JP-derived tools, 2 Alexander tools,
  4 Creold tools, and 1 DPM Core status tool.
- Direct current-document Core operations for normal Illustrator work.
- Separate DPM Production protection for MASTER/work-copy workflows.
- A fixed, typed MCP surface: no arbitrary JSX, shell, or Illustrator menu-command tool.

## Requirements

The verified environment is:

- macOS
- Node.js 20 or later with npm
- Adobe Illustrator 2026 Stable 30.8.1
- Codex with local stdio MCP support

Adobe Illustrator Beta is **not** required. Illustrator 26.1 is currently
unverified. Windows is currently unverified for this packaged release.

## Quick Install

```bash
git clone https://github.com/BlahBlahBlahBB/design-production-mcp.git
cd design-production-mcp
./install.command
```

The installer runs `npm ci --include=dev`, builds the project, and adds or updates only the
`design-production-illustrator` server in `~/.codex/config.toml`. It detects
the active Node executable, creates a timestamped backup before changing an
existing configuration file, and is safe to run more than once. Restart Codex
when it completes.

## Manual Install

```bash
npm ci --include=dev
npm run build
```

Then add the following to `~/.codex/config.toml`, replacing both placeholders
with absolute paths on your Mac. The compiled stdio server entrypoint is
`dist/src/mcp/stdio.js`; no environment variables are required.

```toml
[mcp_servers.design-production-illustrator]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/design-production-mcp/dist/src/mcp/stdio.js"]
```

## Verify Installation

Restart Codex and start a new task. The MCP tool list should include
`illustrator_status`. Call it to confirm that the local server is loaded and
can query Adobe Illustrator. Open Illustrator 2026 Stable before invoking
document tools.

## Core vs DPM Production

**Illustrator Core** tools work directly with the current Illustrator document.
They are intended for normal design operations and do not require a work-copy
session.

**DPM Production** tools are a separate, smaller safety surface for controlled
MASTER/work-copy workflows. They create and reconcile a work copy before a
protected save, so a MASTER is never the target of that production write path.

## Tools

- [Illustrator Core tools](docs/illustrator-core-tools.md)
- [DPM Production tools](docs/dpm-production-tools.md)

## License

This project is licensed under the [MIT License](LICENSE). Donor notices,
revisions, licenses, and local adaptations are recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[open-source origins](docs/open-source-origins.md).
