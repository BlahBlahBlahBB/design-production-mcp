# Phase 2.3A real Illustrator functional QA

## Versions

Functional QA target: stable Illustrator **30.8.1**. Legacy Illustrator 26.1
compatibility is **UNVERIFIED**; no claim about 26.1 is made here.

## Fixture attempt

Reusable support assets were created under the disposable
`/private/tmp/dpm-phase-2.3a-qa` directory: `image-a.png`, `image-b.png`,
`editable-test.svg`, `data.csv`, and `data.xlsx`.

The fixed, version-neutral `.ai` fixture creator started in stable Illustrator
30.8.1 but timed out before saving any fixture master. A subsequent read-only
probe showed only the unsaved temporary document `未标题-1`. A fixed no-save
close operation for that known temporary document also timed out. No user or
MASTER artwork was opened, saved, or changed.

Computer Use is prohibited for this phase, so the modal/runtime state was not
dismissed through UI automation. The safe recovery is to dismiss it manually,
close `未标题-1` without saving, and rerun the same fixture creator. The
fixture definitions use ordinary Illustrator DOM operations and remain suitable
for the future Illustrator 26.1 rerun.

## Matrix status

All 28 public candidates are recorded as `BLOCKED_TEST_FIXTURE` in
[phase-2.3-real-qa.json](phase-2.3-real-qa.json). This reflects a saved-fixture
authorization blocker, not a donor, adapter, runtime-capability, or legacy
compatibility result. No candidate was promoted, no new MCP tool was added,
and all five internal primitives retain their code-level exercise evidence.

The next real test must begin only after the disposable fixture masters have
been saved and can enter the normal verified work-copy flow.
