# Development required

This is deliberately a short list. It excludes all licensed donor-backed
Illustrator primitives, safety adapters, schema normalization, version guards,
focused QA, and MCP registration: those are automatic fusion work.

## CSV/Excel-to-template batch orchestration

**What it does:** reads production rows, maps them to verified Illustrator
template fields, creates managed work copies, applies updates, saves, exports,
and records job-level recovery state.

**Why existing donor code is insufficient:** IE3JP's `manage-datasets.ts`
uses Illustrator variables/datasets, but no reviewed compatible donor contains
the complete DPM workflow for CSV/Excel parsing, per-template mapping,
work-copy authorization, resumable job state, and output reconciliation.

**Open-source implementations searched:** IE3JP datasets; Jinkeda task/checkpoint
architecture (license blocked); Alexander and Creold production scripts; the
additional GitHub ExtendScript/MCP searches recorded in the fusion catalog.

**Existing reusable pieces:** DPM managed sessions, work-copy filesystem
verification, text/object locators, safe save/export primitives; donor dataset
and text/style primitives.

**New core code needed:** a DPM batch job model, spreadsheet/CSV input contract,
field mapping/validation language, deterministic retry and resume semantics,
and per-output manifest/reconciliation logic.

**Illustrator 26.1:** realistic—the Illustrator-side primitives are available;
the missing work is DPM orchestration. **Engineering size: LARGE.**

## QR generation and placement workflow

**What it does:** converts a payload into a QR code, creates a portable visual
representation, and places it in a verified Illustrator work copy with a
deterministic locator/geometry contract.

**Why existing donor code is insufficient:** reviewed licensed donors provide
image/SVG placement and vector primitives, but no complete compatible QR
encoder-plus-Illustrator production workflow was found.

**Open-source implementations searched:** IE3JP image/SVG placement; Alexander
SVG/image helpers; Creold artwork scripts; Jinkeda assets (license blocked);
additional GitHub Illustrator ExtendScript/MCP searches recorded in the fusion
catalog.

**Existing reusable pieces:** safe image placement, editable SVG import
candidate, structural targeting, work-copy and export protections.

**New core code needed:** a QR encoder/rendering dependency or implementation,
payload/error-correction schema, deterministic image/SVG generation, and the
DPM placement orchestration contract.

**Illustrator 26.1:** realistic after QR generation happens outside Illustrator.
**Engineering size: MEDIUM.**
