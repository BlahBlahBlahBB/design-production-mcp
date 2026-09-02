# Phase 1 — macOS Illustrator Real QA

This is the first real-machine acceptance test for the local Illustrator bridge.

## Safety model

The QA runner is designed around these rules:

1. The MASTER Illustrator file must already be saved.
2. The runner computes SHA-256 for the MASTER before any write operation.
3. Writes are permitted only after a separate `.ai` work copy is created.
4. The requested work/PDF/PNG paths are rejected if they equal the MASTER path.
5. One explicitly named text object is changed in the work copy.
6. PDF and PNG are exported from the work copy workflow.
7. The MASTER SHA-256 is computed again and must match exactly.
8. A machine-readable JSON QA report is produced.

A Phase 1 PASS is invalid if the MASTER hash changes.

## Prerequisites

- macOS
- Adobe Illustrator installed on the same Mac
- Node.js 20+
- A disposable/test Illustrator document saved to disk
- At least one text frame with an object name, ideally `@text:name`

Do not use an irreplaceable production master for the first real QA run. Use a copy of a real-world template.

## Preparation in Illustrator

1. Open a test `.ai` template.
2. Save it to disk.
3. Open the Layers panel and give one text object a clear name such as `@text:name`.
4. Leave that document active in Illustrator.

## Run

From the repository root on the `phase/1-illustrator-bridge` branch:

```bash
chmod +x run-real-qa.command
./run-real-qa.command
```

The launcher installs dev dependencies, builds the TypeScript project, and starts the interactive QA runner.

The runner asks for:

- MASTER path (defaults to the active Illustrator document path)
- named text object to modify
- temporary QA text
- QA output directory

## Expected macOS permission prompt

The first Illustrator automation call may cause macOS to ask whether Terminal (or the launching app) may control Adobe Illustrator. Allow it.

If previously denied, review:

System Settings → Privacy & Security → Automation

## Expected PASS evidence

The console should show successful detection, document read, text-frame enumeration, work-copy creation, named-text replacement, export, and unchanged MASTER hash.

The output directory should contain approximately:

```text
<template>__QA_WORK__<timestamp>.ai
<template>__QA__<timestamp>.pdf
<template>__QA__<timestamp>.png
<template>__QA_REPORT__<timestamp>.json
```

The JSON report is the authoritative evidence. Keep it for the Phase 1 acceptance record.

## Failure behavior

On failure, the runner writes a JSON failure report in the repository working directory. Do not repeatedly retry blindly if the error concerns permissions, a modal Illustrator dialog, unexpected active document, or MASTER mutation. Diagnose the first failure before retrying.

## Phase 1 gate

A successful cloud CI run is necessary but not sufficient. Phase 1 remains incomplete until this real QA succeeds on the actual target Illustrator installation and the report confirms `master.unchanged: true`.
