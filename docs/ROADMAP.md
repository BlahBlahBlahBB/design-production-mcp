# Roadmap

## Phase 0 — Foundation
- Template profile schema and validation
- Deterministic template fingerprint
- MASTER overwrite protection
- Resumable batch planning
- Illustrator capability/readiness contract
- Third-party licensing policy

## Phase 1 — Illustrator Bridge
Goal: prove deterministic local automation on the user's installed Illustrator without Adobe's official MCP.

Acceptance gate:
1. Detect installed/running Illustrator and version.
2. Execute a harmless ExtendScript through a local bridge.
3. Read current document metadata.
4. Enumerate text frames and object names without modification.
5. Duplicate/save to a work copy before writes.
6. Modify one named text object in the work copy only.
7. Export PDF and PNG from the work copy.
8. Verify the MASTER file was not modified.
9. Return structured errors for permissions, modal dialogs, timeouts, missing document, and unsupported capabilities.

## Phase 2 — Template Production
- inspect_template
- register_template
- validate_template
- spreadsheet ingestion and column mapping
- preview representative records
- shrink-to-fit rules
- render_batch / resume_batch
- output manifest and exception report

Primary acceptance case: one real Illustrator name-tag template plus a ~40-row spreadsheet.

## Phase 3 — Print Preflight
- missing links/fonts
- RGB/CMYK/spot-color checks
- bleed and artboard checks where scriptable
- text overflow
- output readiness report

## Non-goals for early phases
- Autonomous visual redesign
- Mouse/screen-coordinate automation as the production engine
- Claiming compatibility with every historical Illustrator release
- Unreviewed arbitrary script execution in normal production workflows
