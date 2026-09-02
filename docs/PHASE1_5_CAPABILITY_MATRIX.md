# Phase 1.5 — General Illustrator Capability Matrix

## Purpose

Phase 1 proved the local Illustrator bridge and work-copy safety model on the user's real environment. Phase 1.5 expands that foundation into a broad Illustrator MCP without weakening the production-safety guarantees established in Phase 1.

The primary upstream audit target is:

- `ie3jp/illustrator-mcp-server`
- reviewed revision: `c06f627bcf32dfc474fce8b80f42488c2b2de2e2`
- license: MIT

The upstream README describes 63 built-in tools, while the reviewed `src/tools/registry.ts` registers 64 entries. This matrix uses the registry as the authoritative implementation inventory.

Secondary reference:

- `gherardo200-glitch/illustrator-mcp` (MIT)
- use for cross-checking general Illustrator primitives and implementation ideas
- do not adopt its arbitrary `run_script` escape hatch into the normal production API

Architecture-only reference:

- `jinkeda/Illustrator_MCP`
- architecture ideas only until licensing is independently clear
- no source copying

## Decision labels

- **RETAIN/ADAPT** — upstream capability is useful and can be reimplemented/adapted behind our bridge and safety contracts.
- **REWRITE** — capability is useful, but upstream semantics are too broad/destructive/version-sensitive for direct adoption; implement a constrained local version.
- **DEFER** — useful, but not required for the first general-capability milestone or carries compatibility complexity that should wait.
- **DROP** — not suitable for the normal production-facing MCP surface.

## Safety rules applied to every write capability

1. Never silently overwrite the MASTER document.
2. Existing-document writes require a verified WORK COPY unless the operation explicitly creates a brand-new document.
3. Every mutating operation must identify its target deterministically; avoid relying only on volatile Illustrator selection state.
4. Broad/bulk mutations require scope guards and, where practical, expected-current-state guards.
5. Destructive/irreversible operations require stricter policy than ordinary edits.
6. File operations validate paths before Illustrator receives them.
7. Capability probing is preferred over assuming behavior from Illustrator version strings.
8. No arbitrary ExtendScript execution in the normal production API.
9. Preserve serialized execution, timeout handling, structured errors, temporary-file cleanup, and legacy ExtendScript compatibility from Phase 1.

## Primary upstream matrix

| # | Upstream capability | Area | Decision | Priority | Local direction |
|---:|---|---|---|---|---|
| 1 | `get_document_info` | Read | RETAIN/ADAPT | P0 | Expand current document summary into stable metadata schema. |
| 2 | `get_artboards` | Read | RETAIN/ADAPT | P0 | Read artboard names, rects, sizes, active index. |
| 3 | `get_layers` | Read | RETAIN/ADAPT | P0 | Return layer tree, visibility, lock state and stable traversal path. |
| 4 | `get_selection` | Read | RETAIN/ADAPT | P0 | Inspection only; never use selection alone as a production identity. |
| 5 | `list_text_frames` | Read | RETAIN/ADAPT | P0 | Build on Phase 1 enumeration; include geometry/style/overflow data where supported. |
| 6 | `get_text_frame_detail` | Read | RETAIN/ADAPT | P0 | Detailed typography and paragraph properties with compatibility guards. |
| 7 | `get_colors` | Read | RETAIN/ADAPT | P0 | Swatches + used colors; normalize RGB/CMYK/spot representation. |
| 8 | `get_path_items` | Read | RETAIN/ADAPT | P1 | Geometry, anchors, fill/stroke and clipping metadata. |
| 9 | `get_guidelines` | Read | RETAIN/ADAPT | P1 | Read guides without altering them. |
| 10 | `get_groups` | Read | RETAIN/ADAPT | P0 | Group/clipping/compound structure for deterministic targeting. |
| 11 | `get_effects` | Read | RETAIN/ADAPT | P1 | Read opacity/blend/effects where old ExtendScript exposes them reliably. |
| 12 | `get_images` | Read | RETAIN/ADAPT | P0 | Linked/embedded status, path, scale, resolution and broken-link diagnostics. |
| 13 | `get_symbols` | Read | RETAIN/ADAPT | P1 | Symbol definitions/instances for reusable artwork workflows. |
| 14 | `get_document_structure` | Read | RETAIN/ADAPT | P0 | Unified layer/group/object tree; central inspection primitive. |
| 15 | `find_objects` | Read | RETAIN/ADAPT | P0 | Core deterministic selector by name/type/layer/text/color/etc. |
| 16 | `check_contrast` | Read | DEFER | P2 | Useful design-system feature, not required for production foundation. |
| 17 | `extract_design_tokens` | Read | DEFER | P2 | Useful for design-to-code workflows, not early production priority. |
| 18 | `export` | Export | REWRITE | P0 | Constrain formats/options and enforce MASTER/work-copy path policy. |
| 19 | `export_pdf` | Export | REWRITE | P0 | Preserve Phase 1 safe ordering and PDF save-as side-effect handling. |
| 20 | `get_overprint_info` | Read | RETAIN/ADAPT | P1 | Important for print preflight. |
| 21 | `get_separation_info` | Read | RETAIN/ADAPT | P1 | Process/spot plate diagnostics for print workflows. |
| 22 | `preflight_check` | Utility | REWRITE | P1 | Production-critical; implement checks as explicit deterministic rules with version capability probes. |
| 23 | `check_text_consistency` | Utility | RETAIN/ADAPT | P1 | Placeholder/case/style consistency checks; read-only. |
| 24 | `set_workflow` | Utility | DROP | — | Upstream workflow-mode helper is not an Illustrator primitive and should not be part of the production API. |
| 25 | `set_illustrator_version` | Utility | REWRITE | P1 | Integrate with bridge target-app selection while respecting already-running Illustrator. |
| 26 | `create_rectangle` | Create | RETAIN/ADAPT | P0 | Primitive creation behind explicit target document/write policy. |
| 27 | `create_ellipse` | Create | RETAIN/ADAPT | P0 | Same constrained creation policy. |
| 28 | `create_line` | Create | RETAIN/ADAPT | P0 | Same constrained creation policy. |
| 29 | `create_text_frame` | Create | RETAIN/ADAPT | P0 | Point/area text with explicit geometry/style inputs. |
| 30 | `create_path` | Create | RETAIN/ADAPT | P1 | Explicit anchors/handles; validate coordinate model. |
| 31 | `modify_object` | Modify | REWRITE | P0 | Do not expose one broad unguarded mutator; split/validate properties and require deterministic target + work copy. |
| 32 | `convert_to_outlines` | Modify | REWRITE | P1 | Irreversible; WORK COPY only with exact scope and preflight metadata. |
| 33 | `apply_color_profile` | Modify | REWRITE | P2 | Color-management behavior is version/profile sensitive; capability-probe first. |
| 34 | `place_image` | Modify | RETAIN/ADAPT | P1 | Validate local file path/link/embed mode and target document. |
| 35 | `import_svg_as_editable` | Modify | DEFER | P2 | Valuable but file-import behavior/legacy compatibility needs dedicated QA. |
| 36 | `resize_for_variation` | Modify | REWRITE | P1 | High value for KV variants; implement through controlled duplicate/work-copy workflow. |
| 37 | `align_objects` | Modify | RETAIN/ADAPT | P0 | Deterministic list of target object IDs/paths; avoid implicit selection-only behavior. |
| 38 | `replace_color` | Modify | REWRITE | P1 | Bulk change requires preview/scope filters and expected color guards. |
| 39 | `manage_layers` | Modify | REWRITE | P0 | Split create/rename/show/hide/lock/move/delete; destructive layer actions need stronger guards. |
| 40 | `place_color_chips` | Modify | DEFER | P2 | Convenience/design-system feature. |
| 41 | `place_style_guide` | Modify | DEFER | P2 | Convenience/design-system feature. |
| 42 | `create_crop_marks` | Modify | RETAIN/ADAPT | P1 | Useful print primitive; explicit geometry/target work copy. |
| 43 | `create_document` | Document | RETAIN/ADAPT | P0 | Safe because it creates a new document; validate dimensions/color mode. |
| 44 | `close_document` | Document | DEFER | P2 | Global state + unsaved-data risk; only add after explicit safe-close semantics exist. |
| 45 | `save_document` | Document | REWRITE | P0 | Must preserve MASTER protection; explicit save-work-copy/save-as semantics only. |
| 46 | `open_document` | Document | RETAIN/ADAPT | P0 | Validate path and return explicit document identity. |
| 47 | `group_objects` | Modify | RETAIN/ADAPT | P0 | Deterministic targets, work-copy write guard. |
| 48 | `ungroup_objects` | Modify | RETAIN/ADAPT | P1 | Structural mutation; verify target group identity first. |
| 49 | `duplicate_objects` | Modify | RETAIN/ADAPT | P0 | Useful foundation for variants and production layouts. |
| 50 | `list_fonts` | Read | RETAIN/ADAPT | P0 | No-document read capability; later used by preflight. |
| 51 | `manage_artboards` | Modify | REWRITE | P1 | Split create/rename/resize/reorder/delete; deletion and reindexing need guards. |
| 52 | `set_z_order` | Modify | RETAIN/ADAPT | P1 | Deterministic target and relative ordering semantics. |
| 53 | `move_to_layer` | Modify | RETAIN/ADAPT | P1 | Validate destination layer and target object identity. |
| 54 | `apply_graphic_style` | Modify | RETAIN/ADAPT | P2 | Require existing style lookup; capability-probe old Illustrator behavior. |
| 55 | `manage_swatches` | Modify | REWRITE | P1 | Split create/update/delete; global swatch deletion/replacement needs guards. |
| 56 | `apply_text_style` | Modify | RETAIN/ADAPT | P1 | Require deterministic text target and existing style reference. |
| 57 | `create_gradient` | Modify | RETAIN/ADAPT | P1 | Normalized stop/color schema with old-engine compatibility. |
| 58 | `manage_linked_images` | Modify | REWRITE | P1 | Relink/embed/update are file-destructive/global operations; verify path + exact image target. |
| 59 | `undo` | Modify | DROP | — | Global Illustrator history is session-dependent and non-deterministic for production automation. |
| 60 | `manage_datasets` | Modify | DEFER | P2 | Potentially useful, but external spreadsheet-driven production remains the primary batch model. |
| 61 | `place_symbol` | Modify | RETAIN/ADAPT | P1 | Validate symbol definition + transform. |
| 62 | `create_path_text` | Create | RETAIN/ADAPT | P1 | Useful typography primitive; validate path and text geometry. |
| 63 | `select_objects` | Modify | RETAIN/ADAPT | P0 | Convenience state operation; deterministic selectors remain the source of truth. |
| 64 | `convert_coordinate` | Read | RETAIN/ADAPT | P0 | Foundational geometry utility for artboard/document coordinate consistency. |

## Decision totals

- RETAIN/ADAPT: **41**
- REWRITE: **14**
- DEFER: **7**
- DROP: **2**
- Total registry entries audited: **64**

Priority totals:

- P0: **28**
- P1: **25**
- P2: **9**
- Dropped: **2**

## Secondary-reference candidates not represented as a distinct primary-upstream tool

From `gherardo200-glitch/illustrator-mcp`, evaluate these separately after the primary matrix foundation:

| Candidate | Decision | Priority | Direction |
|---|---|---|---|
| app/status inspection | RETAIN (already exists) | P0 | Phase 1 `detect()` already covers the core need. |
| list open documents | RETAIN/ADAPT | P1 | Useful multi-document inspection with explicit active-document identity. |
| transform selection/objects | REWRITE | P0 | Introduce explicit `transform_objects` with target list, translate/scale/rotate and expected-state guards. |
| explicit set fill/stroke color | RETAIN/ADAPT | P0 | Prefer a narrow style mutation tool over broad `modify_object`. |
| delete objects | REWRITE | P1 | WORK COPY only, deterministic targets, preview/expected-count guard. |
| vectorize image / Image Trace | DEFER | P2 | Valuable creative capability; requires dedicated Illustrator 26.1 compatibility and output-complexity QA. |
| arbitrary `run_script` | DROP from normal API | — | May exist only as an explicitly developer-gated diagnostic mechanism, never normal production surface. |

## Phase 1.5 implementation waves

### Wave A — Core inspection and deterministic targeting

Implement first:

- `get_document_info`
- `get_artboards`
- `get_layers`
- `get_selection`
- expanded `list_text_frames`
- `get_text_frame_detail`
- `get_colors`
- `get_groups`
- `get_document_structure`
- `find_objects`
- `get_images`
- `list_fonts`
- `convert_coordinate`

Goal: Codex can understand a real Illustrator document without touching it and can identify production targets deterministically.

#### Wave A1 implementation record

Implemented on `phase/1.5-general-illustrator-capabilities` as bridge-level, read-only APIs:

- `getDocumentInfo`
- `getArtboards`
- `getLayers`
- `getSelection`
- expanded `listTextFrames`
- `getTextFrameDetail` with deterministic index or unique object-name targeting

These APIs use the existing serialized local transport and add no MCP registry layer. Optional legacy Illustrator properties are isolated per field and report `null` plus an explicit support flag where applicable, so one unavailable property cannot fail a document read. Real-machine validation on Illustrator 26.1.0 covered all six operations without document writes. The behavior was independently implemented after reviewing the fixed upstream revision; no upstream source was copied or substantially adapted.

#### Wave A2 implementation record

Implemented and **REAL-MACHINE VERIFIED — Illustrator 26.1.0** as bridge-level, read-only APIs:

- `getGroups` with clipping/compound-safe summaries and explicit depth/object traversal limits
- `getDocumentStructure` with a bounded Document → Layer → Group/Object tree
- `findObjects` with deterministic structural locators and bounded AND-filtered search
- `convertCoordinate` using a Codex-facing artboard space (top-left origin, positive Y down) and pure TypeScript conversion against read artboard rectangles

`ObjectLocator` is explicitly a document/session structural locator, not a cross-session persistent ID. Real-machine QA validated group and structure traversal, type/text/no-match finding, and artboard/document coordinate round-trip without changing the document, selection, or active artboard. The behavior was independently implemented after reviewing the fixed upstream revision; no upstream source was copied or substantially adapted.

#### Wave A3 implementation record

Implemented and **REAL-MACHINE VERIFIED — Illustrator 26.1.0** as bridge-level, read-only APIs:

- `get_colors` / `getColors` with bounded swatch and artwork-color inspection, explicit RGB/CMYK/gray/spot/gradient/no-color models, and no process-color coercion for spots or gradients
- `get_images` / `getImages` with bounded linked/embedded inspection, file/broken-link diagnostics, display bounds, and explicit unsupported flags for unprovable intrinsic pixels, scale, and effective PPI
- `list_fonts` / `listFonts` as an application-level no-document capability with normalized PostScript/family/style fields, deterministic sorting, deduplication, contains search, and result limits

Real-machine QA used Illustrator 26.1.0 without document writes: color scanning returned RGB, spot, gradient, no-color, and unknown values; a 64-swatch guard correctly returned a partial result; image inspection found seven embedded raster records with bounds and no broken links; and app-level font enumeration returned 1,574 available fonts with verified search, no-match, and truncation behavior. The behavior was independently implemented after reviewing the fixed upstream revision; no upstream source was copied or substantially adapted.

#### Wave A Read Foundation Status

**Wave A read foundation complete.** This is not a declaration that Phase 1.5 is complete; editing, preflight, linked-image management, replace-color, and font replacement remain later work.

- A1 (real-machine verified): `get_document_info`, `get_artboards`, `get_layers`, `get_selection`, `list_text_frames`, `get_text_frame_detail`
- A2 (real-machine verified): `get_groups`, `get_document_structure`, `find_objects`, `convert_coordinate`
- A3 (real-machine verified): `get_colors`, `get_images`, `list_fonts`

### Wave B — Safe general editing primitives

Implement next:

- `create_document`
- `open_document`
- safe `save_document`
- `create_rectangle`
- `create_ellipse`
- `create_line`
- `create_text_frame`
- constrained object property updates
- explicit fill/stroke update
- `align_objects`
- `group_objects`
- `duplicate_objects`
- `select_objects`

Goal: broad general-purpose Illustrator editing while preserving the Phase 1 work-copy model.

### Wave C — Production and print capabilities

Implement after Wave A/B are proven:

- generalized export / PDF export
- `get_overprint_info`
- `get_separation_info`
- `preflight_check`
- `check_text_consistency`
- `get_path_items`
- `get_guidelines`
- `get_effects`
- `get_symbols`
- `create_crop_marks`
- `replace_color`
- `manage_layers`
- `manage_artboards`
- `manage_swatches`
- `manage_linked_images`
- `resize_for_variation`

Goal: support actual print/design-production workflows before spreadsheet batch production begins.

## Phase 1.5 acceptance principles

Phase 1.5 is not complete merely because tool names exist. For each implemented capability:

1. Unit/regression tests pass.
2. Tool has explicit read/write/destructive classification.
3. Write tools enforce local safety policy.
4. Illustrator 26.1 real-machine capability is tested for representative behavior before marking it supported.
5. Unsupported/version-sensitive behavior returns a structured error rather than silently degrading.
6. No Phase 1 MASTER protection regression.
7. The matrix is updated from planned → implemented → real-machine verified as work proceeds.
