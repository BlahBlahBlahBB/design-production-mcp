# Open-source origins

This document records the licensed donor code used by the public Illustrator
MCP runtime and the narrow local adaptations made during integration.

| Donor | Reviewed revision | License | Runtime contribution | Local adaptation |
|---|---|---|---|---|
| [IE3JP illustrator-mcp-server](https://github.com/ie3jp/illustrator-mcp-server) | `1814485cfa24787215f0ec515a6853cb293e1e0a` | MIT | 67 Core registry tools, JSX helpers, file transport, image-header utility | Stable 2026 default target, local serialized queue, build-time helper copy, and separate DPM Production registration. |
| [Alexander Ladygin illustrator-scripts](https://github.com/Alexander-Ladygin/illustrator-scripts) | `fc7625410b62c833fce100f67cf18a97588279c5` | MIT | Fixed Action payloads for `expand_objects` and `pathfinder_objects` | Typed current-selection wrappers; no arbitrary Action payloads or donor UI. |
| [Creold illustrator-scripts](https://github.com/creold/illustrator-scripts) | `9b3e3eeade9ba748f41612ec4697bb6a5c2489c2` | MIT | Fixed DOM operations for artboard fit, image trace, formatted text, and artboard duplication | Typed current-document wrappers; donor dialogs and script plumbing removed. |

The remaining DPM Production implementation is local code. Its work-copy
controls are intentionally separate from normal Core commands: Core acts on the
current Illustrator document, while DPM Production protects controlled
MASTER/work-copy workflows.

`jinkeda/Illustrator_MCP` is not included. Its license could not be positively
verified from a root repository license file, so it remains a non-code review
candidate only.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for the complete legal
notice and attribution record.
