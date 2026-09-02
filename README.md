# design-production-mcp

Local design-production automation for Adobe Illustrator, focused on deterministic production workflows rather than autonomous visual redesign.

## Current architecture

```text
Codex / MCP client
        |
        v
Design Production MCP
        |
        +-- production rules
        |   +-- template profiles
        |   +-- batch/resume
        |   +-- QA / MASTER protection
        |
        v
IllustratorBridge
        |
        +-- macOS: osascript -> AppleScript -> ExtendScript
        +-- Windows: PowerShell/COM -> ExtendScript
        |
        v
Adobe Illustrator
```

## Phase 1 status

Implemented on `phase/1-illustrator-bridge`:

- serialized local JSX transport
- macOS AppleScript transport
- Windows PowerShell/COM transport
- temporary JSON result channel
- timeout/error classification
- Illustrator status/version probe
- document summary inspection
- text-frame enumeration
- protected work-copy creation
- named-text replacement
- PDF/PNG output flow
- MASTER overwrite guards
- GitHub Actions CI

Real Illustrator hardware/software validation is still required before Phase 1 can be considered complete.

See `docs/ROADMAP.md` and Draft PR #1 for acceptance gates.
