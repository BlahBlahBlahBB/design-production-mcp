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

#### Open-source fusion additions
- Verified revision: `1814485cfa24787215f0ec515a6853cb293e1e0a`
- Imported/adapted files: `src/tools/modify/place-image.ts`, `src/tools/modify/manage-linked-images.ts`, and `src/tools/modify/manage-artboards.ts`.
- Local destinations: `src/illustrator/legacy/donor-backed/links.ts` and `src/illustrator/legacy/donor-backed/artboards.ts`.
- Adaptations: removed upstream MCP/temporary-result registration; retained Illustrator DOM behavior; require DPM's `SafeMutationContext` adapter before execution; safely narrowed capabilities are exposed as `place_image`, `relink_image`, and `rearrange_artboards`.
- Additional imported/adapted files: `src/tools/modify/convert-to-outlines.ts`, `create-path-text.ts`, `manage-text-styles.ts`, `manage-layers.ts`, `manage-datasets.ts`, `create-crop-marks.ts`, and the corresponding export/preflight implementations.
- Additional local destination: `src/illustrator/legacy/donor-backed/backlog-operations.ts`.
- Adaptations: removed MCP/result-file transport and retained closed, fixed Illustrator DOM/menu operations only. These are registered through the safe donor adapter and are not newly exposed as MCP tools.

### Alexander-Ladygin/illustrator-scripts
- License: MIT, verified from the upstream `LICENSE` file.
- Verified revision: `fc7625410b62c833fce100f67cf18a97588279c5`
- Upstream copyright: Copyright (c) 2018 Alexander Ladygin.
- Imported/adapted file: `libraries/AI_PS_Library.js` (`AIAction` PathFinder and Expand event payload generators).
- Local destination: `src/illustrator/legacy/donor-backed/actions.ts`.
- Adaptations: extracted the documented Action payload generation only; preserved plugin identifiers and numeric parameter IDs; replaced prototype helpers and fixed Desktop action paths with local helpers and a temp-file cleanup wrapper; safely narrowed capabilities are exposed as `expand_objects` and `pathfinder_objects`.
- Additional imported/adapted files: `minusOffset.jsx`, `compoundFix.jsx`, and `inlineSVGToAI.jsx`.
- Additional local destination: `src/illustrator/legacy/donor-backed/backlog-operations.ts`.
- Adaptations: removed dialogs, saved settings, and arbitrary selection modes; retained fixed offset/path, compound/clipping, raster, and SVG-import behavior with DPM's authorization and failure envelope.

### creold/illustrator-scripts
- License: MIT, verified from the upstream `LICENSE` file.
- Verified revision: `9b3e3eeade9ba748f41612ec4697bb6a5c2489c2`
- Upstream copyright: Copyright (c) 2025 Sergey Osokin.
- Imported/adapted file: `jsx/FitArtboardsToArtwork.jsx`.
- Local destination: `src/illustrator/legacy/donor-backed/creold-compat.ts`.
- Adaptations: retained only its non-interactive `fitArtboardToSelectedArt` Illustrator operation; removed dialogs/global script setup and require DPM's safe adapter; exposed as `fit_artboard_to_objects`.
- Additional imported/adapted sources: Image Trace, formatted-text, and symbol placement scripts.
- Additional local destination: `src/illustrator/legacy/donor-backed/backlog-operations.ts`.
- Adaptations: retained fixed Illustrator-side operations only; no ScriptUI or donor server plumbing is imported.

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
