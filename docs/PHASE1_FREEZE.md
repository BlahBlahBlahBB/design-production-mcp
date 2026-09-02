# Phase 1 Freeze — Illustrator Bridge

Status: **PASS / COMPLETE**

Date: 2026-09-02

## Verified environment

- macOS real-machine validation completed successfully.
- Adobe Illustrator: `26.1.0`
- Node.js for real QA: `v20.20.2`
- Repository branch during acceptance: `phase/1-illustrator-bridge`
- Accepted head before freeze documentation: `2c17c00e6d0ee09926b50c61f1377da90de854fe`
- Automated test suite: `16 passed, 0 failed`

## Real-machine acceptance evidence

The Phase 1 real QA successfully verified the complete protected write path:

1. Illustrator detection through AppleScript.
2. AppleScript → ExtendScript execution.
3. Active document metadata read.
4. Text frame enumeration.
5. Guarded legacy unnamed-text targeting by text-frame index.
6. SHA-256 computed for the MASTER before any write.
7. Separate Illustrator work copy created.
8. Active-document path verified to be the work copy before mutation.
9. Current text contents verified against the read-only snapshot before replacement.
10. Text replacement performed only in the work copy.
11. AI work copy saved successfully.
12. PNG exported successfully.
13. PDF exported successfully.
14. MASTER SHA-256 recomputed after all work-copy/export operations.
15. MASTER before/after SHA-256 values were identical.

MASTER verification hash:

`d273aeaf91624a65b8293f4e46a027665b8082f669af141b2a61e92b847c1b40`

Result: **MASTER unchanged — PASS**.

## Compatibility findings resolved during Phase 1

### Legacy ExtendScript JSON support

Illustrator 26.1.0 exposed an ExtendScript runtime without a usable global `JSON.stringify`. The local transport was changed to use an ES3-compatible internal result serializer so the bridge does not depend on modern JavaScript JSON globals inside Illustrator.

### Unnamed legacy text frames

Real production artwork contained text frames without object names. Phase 1 added guarded index targeting for QA/legacy compatibility with:

- index bounds validation
- locked/hidden checks
- expected-current-content guard
- active work-copy path guard

Named semantic targets remain the preferred long-term production approach.

### Non-interactive Codex execution

The real QA runner now supports a non-interactive CLI mode so Codex execution does not depend on persistent stdin/readline sessions.

## Phase 1 safety invariants

- MASTER files must never be overwritten intentionally.
- Writes require a separate work copy.
- Write operations verify the active document is the expected work copy.
- Output paths are checked against MASTER overwrite.
- Legacy index replacement requires expected-current-content verification.
- Real QA compares MASTER SHA-256 before and after execution.
- Structured failures stop the workflow instead of relaxing safety gates.

## Phase 1 conclusion

The local Illustrator bridge is accepted on the tested real installation and is ready to serve as the foundation for Phase 1.5 general Illustrator capability fusion.

Next phase: `phase/1.5-general-illustrator-capabilities`.
