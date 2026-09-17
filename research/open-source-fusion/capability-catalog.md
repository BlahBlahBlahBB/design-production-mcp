# Open-source fusion capability catalog

This is the final Phase 2.2 source-fusion inventory. The field-level record is
[capability-catalog.json](capability-catalog.json); the authoritative processed
queue is [available-backlog.json](available-backlog.json).

## Phase 2.2 result

All 33 licensed/reusable queue entries were physically retained or fused under
the internal donor-backed surface. Five are fixed internal primitives and 28
are public candidates pending real Illustrator 26.1 validation. No new MCP
tool is registered in this phase, and the available backlog is zero.

## Phase 2.3A QA gate

Stable Illustrator 30.8.1 was selected for functional QA. The disposable
fixture creator reached Illustrator but timed out before it could save a
fixture master, then a fixed no-save close of its known temporary unsaved
document also timed out. Each of the 28 public candidates therefore has a
concrete `BLOCKED_TEST_FIXTURE` record in
[phase-2.3-real-qa.json](phase-2.3-real-qa.json). No candidate was promoted
and no new MCP tool was added. The missing Illustrator 26.1.0 installation is
recorded independently as `legacy26_1Status: UNVERIFIED`, rather than as a
functional failure.

| Source | Verified revision | License | Fused destination / retained capability |
|---|---|---|---|
| DPM | `8fb22aea91346fcd4595d5e19c6eac0f4ef19fed` baseline | MIT | Existing work-copy, locator, mutation, editing, and inspection primitives retained where safer than donor variants |
| IE3JP | `1814485cfa24787215f0ec515a6853cb293e1e0a` | MIT | Image/link and artboard modules; fixed text, style, layer, color, SVG, export, preflight, dataset, and crop-mark operations in `legacy/donor-backed/backlog-operations.ts` |
| Alexander Ladygin | `fc7625410b62c833fce100f67cf18a97588279c5` | MIT | Expand/Pathfinder actions plus fixed rasterize, compound/clipping, offset-path, and path cleanup operations |
| Creold / Sergey Osokin | `9b3e3eeade9ba748f41612ec4697bb6a5c2489c2` | MIT | Artboard fit plus Image Trace, formatted-text, and symbol-compatible operations |
| Jinkeda | `c814a2922e627efcc9ff6914fb1bc7d51a9585bc` | README claims MIT; exact checkout has no `LICENSE` | No source imported |

Every new fixed operation calls
`src/illustrator/legacy/adapters/safe-donor-operation.ts`. That adapter
requires a verified `SafeMutationContext`, confirms the active Illustrator
document is DPM's authorized work copy, quarantines unknown outcomes, and
marks structural writes stale. Callers cannot pass raw JSX, Action text, or an
arbitrary Illustrator menu-command name.

## Final state vocabulary

- **INTEGRATED_PUBLIC:** implemented and publicly exposed after validation.
- **PUBLIC_CANDIDATE:** fused internally and appropriate for a later public
  schema after real Illustrator validation.
- **INTEGRATED_INTERNAL:** retained/fused internal primitive with no standalone
  public operation.
- **LICENSE_BLOCKED:** source cannot be imported under the verified license
  record.
- **TECHNICALLY_BLOCKED:** no safe reusable implementation exists without
  creating undocumented Illustrator behavior.
- **DEVELOPMENT_REQUIRED:** genuine DPM-specific core workflow creation.
- **NEWER_ADOBE_DEPENDENCY:** capability depends on newer/private Adobe
  services without an Illustrator 26.1 replacement.

## Explicit exclusions

The Jinkeda transform, effects/appearance, and pattern implementations remain
**LICENSE_BLOCKED** because the exact reviewed checkout has no license file.
Outline stroke is **TECHNICALLY_BLOCKED**: the reviewed legal sources do not
provide a complete reusable route that avoids inventing an undocumented Action
payload. Adobe GenAI/AI Assistant remains a **NEWER_ADOBE_DEPENDENCY**.

Only genuine new product work remains in
[development-required.md](development-required.md): CSV/Excel template
orchestration and QR placement orchestration. No adapter, schema, locator,
safety, or QA work is listed there.
