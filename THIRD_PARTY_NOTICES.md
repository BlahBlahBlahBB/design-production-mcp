# Third-Party Notices

This project is an independent design-production automation project.

## Approved code/reference sources

### ie3jp/illustrator-mcp-server
- License: MIT
- Reviewed revision: `c06f627bcf32dfc474fce8b80f42488c2b2de2e2`
- Upstream copyright: Copyright (c) 2026 cyocun (IE3)
- Reviewed implementation files: `src/executor/jsx-runner.ts`, `src/executor/file-transport.ts`
- Local use: architecture and behavior were adapted into a separately written transport layer covering serialized Illustrator execution, macOS `osascript`/AppleScript → ExtendScript, Windows PowerShell/COM → ExtendScript, temporary result transport, timeout handling, and cleanup.
- The local implementation is intentionally narrower and uses different APIs/naming to fit `IllustratorBridge` and the production-safety model.
- Any copied or substantially adapted portions must retain the upstream copyright and MIT permission notice.

### gherardo200-glitch/illustrator-mcp
- License: MIT
- Upstream copyright: Copyright (c) 2026 gherardo200-glitch
- Intended use: secondary implementation reference for AppleScript → ExtendScript execution and MCP safety patterns.
- No source from this repository has been copied into the Phase 1 implementation at the time of this notice update.

## Architecture-only reference

### jinkeda/Illustrator_MCP
At Phase 0 review time, the repository README advertised MIT but the repository did not expose a root LICENSE file through the reviewed GitHub state. Until licensing is independently confirmed, no source code from this repository may be copied or adapted. Architecture ideas may be studied without copying implementation.

## Policy

Do not import third-party source code without first recording its repository, exact revision, license, files/sections used, and local modifications in this document.
