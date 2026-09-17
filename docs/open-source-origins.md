# Open-source fusion origins

This record covers the Phase 2 fusion and Phase 3 architecture inversion.
Phase 3 imports the reviewed IE3JP Core substantially as-is under
`src/illustrator/core/ie3jp/`; DPM production protection remains separate.

| Donor | Verified revision | License | Upstream source | Local destination | Adaptation |
|---|---|---|---|---|---|
| ie3jp/illustrator-mcp-server | `1814485cfa24787215f0ec515a6853cb293e1e0a` | MIT | `src/tools/modify/place-image.ts` | `src/illustrator/legacy/donor-backed/links.ts` | Removed MCP/file-result transport and retained placed-image / embed logic behind DPM safe adapter. |
| ie3jp/illustrator-mcp-server | `1814485cfa24787215f0ec515a6853cb293e1e0a` | MIT | `src/tools/modify/manage-linked-images.ts` | `src/illustrator/legacy/donor-backed/links.ts` | Retained `PlacedItem.relink` behavior; future caller must establish exact selected target from a structural locator. |
| ie3jp/illustrator-mcp-server | `1814485cfa24787215f0ec515a6853cb293e1e0a` | MIT | `src/tools/modify/manage-artboards.ts` | `src/illustrator/legacy/donor-backed/artboards.ts` | Retained non-interactive `Document.rearrangeArtboards` logic and interaction-level restoration. |
| Alexander-Ladygin/illustrator-scripts | `fc7625410b62c833fce100f67cf18a97588279c5` | MIT | `libraries/AI_PS_Library.js` | `src/illustrator/legacy/donor-backed/actions.ts` | Extracted Pathfinder and Object > Expand Action payload generation; preserved undocumented plugin IDs/parameter IDs, replaced prototype helpers/temp path. |
| creold/illustrator-scripts | `9b3e3eeade9ba748f41612ec4697bb6a5c2489c2` | MIT | `jsx/FitArtboardsToArtwork.jsx` | `src/illustrator/legacy/donor-backed/creold-compat.ts` | Retained the non-interactive `fitArtboardToSelectedArt` operation; removed ScriptUI and global setup. |
| ie3jp/illustrator-mcp-server | `1814485cfa24787215f0ec515a6853cb293e1e0a` | MIT | `src/tools/modify/convert-to-outlines.ts`, `create-path-text.ts`, `manage-text-styles.ts`, `manage-layers.ts`, `manage-datasets.ts`, `create-crop-marks.ts`, and export/preflight tools | `src/illustrator/legacy/donor-backed/backlog-operations.ts` | Removed MCP/result-file plumbing and UI decisions; retained only named Illustrator DOM/menu operations behind a closed request union and DPM safety adapter. |
| Alexander-Ladygin/illustrator-scripts | `fc7625410b62c833fce100f67cf18a97588279c5` | MIT | `minusOffset.jsx`, `compoundFix.jsx`, `inlineSVGToAI.jsx`, `libraries/AI_PS_Library.js` | `src/illustrator/legacy/donor-backed/backlog-operations.ts` | Extracted noninteractive fixed offset, path/compound, clipping, raster, and import primitives; parameters are normalized and no donor UI, file settings, or arbitrary Action input remains. |
| creold/illustrator-scripts | `9b3e3eeade9ba748f41612ec4697bb6a5c2489c2` | MIT | Image Trace, formatted-text, symbol, and artboard scripts | `src/illustrator/legacy/donor-backed/backlog-operations.ts` | Retained fixed Illustrator-side behavior only; DPM owns document identity, result envelope, and later public schema decisions. |
| ie3jp/illustrator-mcp-server | `1814485cfa24787215f0ec515a6853cb293e1e0a` | MIT | `src/tools/`, `src/executor/`, `src/jsx/helpers/common.jsx`, `src/utils/image-header.ts` | `src/illustrator/core/ie3jp/` | Copied substantially as-is for the direct Core runtime. Only target default, serialization dependency, build helper-copy, and DPM Production registration boundaries were changed. |

The legacy donor adapter at
`src/illustrator/legacy/adapters/safe-donor-operation.ts` remains for DPM
Production: it requires an authorized work copy, quarantines unknown outcomes,
and marks production structural writes stale. It is no longer the mandatory
path for normal Core commands. The Core exposes IE3JP's direct public registry
plus fixed typed Alexander and Creold wrappers; none accepts arbitrary JSX,
shell input, or a caller-selected Illustrator menu command.

## Non-imported review candidates

- `jinkeda/Illustrator_MCP` at `c814a2922e627efcc9ff6914fb1bc7d51a9585bc`:
  current upstream was re-fetched in Phase 2 continuation. The README states
  MIT, but this exact current upstream checkout still has no LICENSE file.
  Its JSX/Python implementation remains catalog-only until a repository license
  file is positively verified. No source was copied.
- The Phase 2.2 queue of licensed/reusable IE3JP, Alexander, and Creold
  operations is fused under the fixed internal operation registry. It remains
  unexposed pending later real-device validation, rather than awaiting further
  adapter or identity work.
