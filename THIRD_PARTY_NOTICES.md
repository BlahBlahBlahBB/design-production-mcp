# Third-Party Notices

This project is independently maintained and distributed under the MIT License.
The notices below apply to third-party code included in, or substantially
adapted for, the public runtime. Their copyright and license notices remain in
effect.

## IE3JP — `ie3jp/illustrator-mcp-server`

- Upstream: <https://github.com/ie3jp/illustrator-mcp-server>
- Reviewed revision: `1814485cfa24787215f0ec515a6853cb293e1e0a`
- License: MIT
- Copyright: Copyright (c) 2026 cyocun (IE3)
- Included location: `src/illustrator/core/ie3jp/`

The IE3JP Core registry, tool modules, file transport, JSX helpers, and image
header utility are copied substantially as-is. The upstream MIT text is
preserved at `src/illustrator/core/ie3jp/LICENSE`.

Minimal integration changes set Adobe Illustrator 2026 Stable as the default
target, replace the upstream `p-limit` dependency with a local serialized
promise queue, copy JSX helpers at build time, and register DPM Production
tools separately. The copied Core continues to operate on the current active
Illustrator document.

## Alexander Ladygin — `Alexander-Ladygin/illustrator-scripts`

- Upstream: <https://github.com/Alexander-Ladygin/illustrator-scripts>
- Reviewed revision: `fc7625410b62c833fce100f67cf18a97588279c5`
- License: MIT
- Copyright: Copyright (c) 2018 Alexander Ladygin

Fixed Action payload generation derived from `libraries/AI_PS_Library.js` is
used by `expand_objects` and `pathfinder_objects`. DPM wraps those fixed
operations in a typed current-selection envelope; it does not expose arbitrary
Action payloads.

## Creold / Sergey Osokin — `creold/illustrator-scripts`

- Upstream: <https://github.com/creold/illustrator-scripts>
- Reviewed revision: `9b3e3eeade9ba748f41612ec4697bb6a5c2489c2`
- License: MIT
- Copyright: Copyright (c) 2025 Sergey Osokin

Fixed non-interactive DOM behavior is adapted for the Creold Core wrappers:
artboard fitting, image tracing, formatted-text replacement, and artboard
duplication. Donor dialogs and arbitrary script execution are not included.

## SheetJS Community Edition — `xlsx`

- Distribution: <https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz>
- Pinned version: `0.20.3`
- License: Apache-2.0
- Copyright: Copyright (C) 2012-present SheetJS LLC

The production input-format helper uses the official SheetJS Community Edition
package to read the first worksheet of uploaded spreadsheet data. Its API use
is unchanged from the previous dependency version.

## Not included: Jinkeda

`jinkeda/Illustrator_MCP` was reviewed only as an architecture candidate. Its
license was not positively verified from a root repository license file. No
source code from that repository is included in this project.

## Policy

Before adding third-party source, record its upstream repository, exact
revision, license, imported portions, and local changes in this document and
in [the origins record](docs/open-source-origins.md).
