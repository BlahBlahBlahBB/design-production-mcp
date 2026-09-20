# Illustrator version compatibility

Design Production MCP targets Adobe Illustrator 2022–2026. Support and verification are separate claims: an unverified target is intended to run, but has not passed maintainer real-machine QA.

| Version | Internal version | Support status | Verification source | Verification date | Notes |
|---|---:|---|---|---|---|
| Illustrator 2022 | 26.x | `SUPPORTED_UNVERIFIED` | none | none | No maintainer real-machine run recorded. |
| Illustrator 2023 | 27.x | `SUPPORTED_UNVERIFIED` | none | none | No maintainer real-machine run recorded. |
| Illustrator 2024 | 28.x | `SUPPORTED_UNVERIFIED` | none | none | No maintainer real-machine run recorded. |
| Illustrator 2025 | 29.x | `SUPPORTED_UNVERIFIED` | none | none | No maintainer real-machine run recorded. |
| Illustrator 2026 | 30.8.1 | `MAINTAINER_VERIFIED` | Maintainer real-machine QA | 2026-09-20 | Current verified Stable target; includes Story Typography and v0.4.3 batch image-template QA. |

Run `./compatibility-check.command` or `npm run compatibility:check` on the target computer to perform a disposable-document smoke check. The checker creates a new unsaved document, writes a sanitized `compatibility-report.json` in the project directory by default (or to `--output <path>`), closes only its marked document with `DONOTSAVECHANGES`, and removes its temporary export. It does not save or inspect existing user documents. External image placement is reported as `SKIPPED` because the checker does not use a user-provided image fixture.

The report includes only MCP, operating-system platform, Node, Illustrator version, timestamp, and capability statuses (`PASS`, `FAIL`, `SKIPPED`, `VERSION_DEPENDENT`). It is not uploaded automatically. Community reports may later support a `COMMUNITY_VERIFIED` status; no such report is currently recorded.

The 2026 Stable verification also covers v0.4.1 document-wide Story Typography: real write QA succeeded and the final `get_typography_metrics(all_stories=true)` read returned Story data, Han/Latin script runs, font metadata, and paragraph alignment without the prior whole-Story wrapper failure.

The v0.4.3 batch image-template verification covers a real 34-slot QR template: 34/34 placements passed with 30.5 mm sizing, centering, clipping masks, label replacement, and save. The measured `place_images` JSX time was 2413 ms and transport elapsed was 2620 ms.

## Routing limits

- With one installed/running Stable Illustrator version from 2022–2026, the default target uses that Stable installation. On macOS the default path detector selects the newest installed target in that range; on Windows the existing Illustrator COM ProgID is used.
- Illustrator Beta is never a fallback target.
- On macOS, AppleEvents address the shared Stable bundle ID. A selected app path does not reliably distinguish multiple simultaneously running Stable instances. On Windows, COM similarly cannot reliably choose among multiple running Illustrator versions. `set_illustrator_version` is therefore a routing hint, not a guarantee of exact multi-instance selection.
- Optional Classic DOM capabilities may degrade individually as `VERSION_DEPENDENT`; ordinary Core operations do not reject an otherwise supported target merely because an unrelated capability is absent.
