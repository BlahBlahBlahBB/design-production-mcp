# Typography capability matrix

Scope: `get_typography_metrics` and `set_typography` in Illustrator Core. Both tools support explicit `uuids[]` TextFrame targets; v0.4.1 also supports mutually exclusive `all_stories=true` for document-wide Story typography. The
official MCP capture used for comparison is local-only:
`research/adobe-official-mcp-live/output/official-tools.json` (`GetTypographyMetrics`).
It exposes **READ**, not a typography write operation. “Stable 30.8.1 QA” is
deliberately a factual test status, not a promise inferred from an API name.

| UI / property name | Official READ | Official WRITE | IE3JP | Alexander | Creold | Illustrator DOM | Our READ | Our WRITE | Stable 30.8.1 QA | Impl source | Limits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Text content / length / overflow | Yes | No | text frame read | — | — | `contents`, `overflows` | Yes | No | Pass (Story read) | Official-compatible glue | `overflows` is unavailable for some text kinds |
| Font family / style / missing | Yes | No | character run read | — | — | `textFont` | Yes | Yes | Pass (Story read/write) | IE3JP detail + DOM glue | Missing font returns `FONT_DEPENDENT` on write |
| Font embeddable | Yes | No | — | — | — | Not exposed | `null` + label | No | N/A | Official-compatible glue | `NOT_EXPOSED_BY_CLASSIC_DOM`; never guessed |
| Font caps | Yes | No | — | — | — | `capitalization` | Yes | Yes | Pending | DOM glue | Enum availability is font/version dependent |
| Font size | Yes | No | batch font fields | — | — | `size` | Yes | Yes | Pending | IE3JP reuse + DOM glue | Positive points only |
| Tracking | Yes | No | character run read | — | — | `tracking` | Yes | Yes | Pending | IE3JP reuse + DOM glue | 1/1000 em |
| Manual kerning | Yes (method) | No | kerning pair read | — | — | `Character.kerning` | Yes (method) | Yes | Pending | IE3JP reuse + DOM glue | Pair/range semantics vary by text engine |
| Kerning method | Yes | No | character run read | — | — | `kerningMethod` | Yes | Yes | Pending | IE3JP reuse + DOM glue | auto/optical/metrics/none |
| Character leading | Yes | No | — | — | — | `CharacterAttributes.leading` | Yes | Yes | Pending | DOM glue | Different from paragraph auto-leading controls |
| Character auto leading | Yes | No | — | — | — | `CharacterAttributes.autoLeading` | Yes | Yes | Pending | DOM glue | Different from `autoLeadingAmount` |
| Baseline shift | Yes | No | character run read | — | — | `baselineShift` | Yes | Yes | Pending | IE3JP reuse + DOM glue | points |
| Horizontal / vertical scale | Yes | No | character run read | — | — | `horizontalScale`, `verticalScale` | Yes | Yes | Pending | IE3JP reuse + DOM glue | percentage |
| Character rotation | No | No | character run read | — | — | `rotation` | Extra | Yes | Pending | IE3JP reuse + DOM glue | character-level rotation |
| Baseline position | No | No | — | — | — | `baselinePosition` | Extra | Yes | Pending | DOM glue | superscript/subscript enum |
| Underline / strike through / no break | No | No | — | — | — | `underline`, `strikeThrough`, `noBreak` | Extra | Yes | Pending | DOM glue | Classic DOM attributes |
| Language | No | No | — | — | — | `language` | Extra | Yes | Pending | DOM glue | Installed language support can vary |
| Tsume / aki left / aki right | No | No | character run read | — | — | `Tsume`, `akiLeft`, `akiRight` | Extra | Yes | Pending | IE3JP reuse + DOM glue | CJK typography; `VERSION_DEPENDENT` in UI coverage |
| Proportional metrics | No | No | character run read | — | — | `proportionalMetrics` | Extra | Yes | Pending | IE3JP reuse + DOM glue | Font-dependent behavior |
| Fill / stroke / stroke weight | No | No | text appearance helpers | — | — | character color/weight attributes | Extra | Yes | Pass (Story write) | IE3JP shared helpers + DOM glue | Use `set_appearance` for non-text artwork |
| Overprint fill / stroke | No | No | — | — | — | `overprintFill`, `overprintStroke` | Extra | Yes | Pending | DOM glue | Output/overprint support is version dependent |
| Ligature / discretionary ligature | No | No | — | — | — | `ligature`, `discretionaryLigature` | Extra | Conditional | Pending | DOM glue | `FONT_DEPENDENT` when unavailable |
| Contextual ligature / fractions / ordinals | No | No | — | — | — | classic OpenType attrs | Extra | Conditional | Pending | DOM glue | `FONT_DEPENDENT` when unavailable |
| Swash / titling / connection forms | No | No | — | — | — | classic OpenType attrs | Extra | Conditional | Pending | DOM glue | `FONT_DEPENDENT` when unavailable |
| Stylistic alternates / alternate glyphs / figure style | No | No | — | — | — | classic OpenType attrs | Extra | Conditional | Pending | DOM glue | `FONT_DEPENDENT` when unavailable |
| Paragraph alignment | Yes | No | paragraph read | — | — | `justification` | Yes | Yes | Pass (Story read/write) | IE3JP detail + DOM glue | left/center/right and all four justify modes |
| First line / left / right indent | No | No | paragraph read | — | — | paragraph indent attrs | Extra | Yes | Pending | IE3JP reuse + DOM glue | points |
| Space before / after | No | No | paragraph read | — | — | `spaceBefore`, `spaceAfter` | Extra | Yes | Pending | IE3JP reuse + DOM glue | points |
| Hyphenation / capitalized words / limit | No | No | hyphenation read | — | — | paragraph hyphenation attrs | Extra | Yes | Pending | DOM glue | Settings may be locale dependent |
| Hyphen preference / zone / consecutive / min word pieces | No | No | — | — | — | paragraph hyphenation attrs | Extra | Yes | Pending | DOM glue | `VERSION_DEPENDENT` if absent |
| Single-word justification | No | No | — | — | — | `singleWordJustification` | Extra | Yes | Pending | DOM glue | Applies to justified paragraphs |
| Desired/min/max word spacing | No | No | — | — | — | word spacing attrs | Extra | Yes | Pending | DOM glue | Applies to justified paragraphs |
| Desired/min/max letter spacing | No | No | — | — | — | letter spacing attrs | Extra | Yes | Pending | DOM glue | Applies to justified paragraphs |
| Desired/min/max glyph scaling | No | No | — | — | — | glyph scaling attrs | Extra | Yes | Pending | DOM glue | Applies to justified paragraphs |
| Every-line composer | No | No | — | — | — | `everyLineComposer` | Extra | Yes | Pending | DOM glue | Composer support varies by text engine |
| Paragraph auto leading amount | No | No | — | — | — | `autoLeadingAmount` | Extra | Yes | Pending | DOM glue | Paragraph-level percentage; not character `autoLeading` |
| Paragraph leading type | Yes | No | — | — | — | `leadingType` | Yes | Yes | Pending | DOM glue | bottom-to-bottom / top-to-top enum |
| Bunri kinshi / kinsoku / kurikaeshi / mojikumi | No | No | — | — | — | CJK paragraph attrs | Extra | Conditional | Pending | DOM glue | `VERSION_DEPENDENT` or `NOT_EXPOSED_BY_CLASSIC_DOM` if absent |

## v0.4.1 document-wide Story QA

Adobe Illustrator 2026 Stable 30.8.1 real-machine QA confirms the document-wide Story path can apply mixed Han / Latin typography and return Story-level metrics without relying on `doc.textFrames`. The final read-only QA returned Story data, 44 Han script runs, 32 Latin script runs, installed font metadata, and paragraph alignment successfully.

The reader treats local Character / Paragraph wrapper failures as partial metrics when possible. Story text content falls back to `Story.textRange.contents` when a direct `Story.contents` value is unavailable, preventing the previous whole-Story `undefined 不是对象` failure.

## Result labels and panel coverage

- `FONT_DEPENDENT`: the requested font is not installed, or an OpenType feature
  cannot be enabled by that font. It is a failed/conditional result, never a
  success.
- `VERSION_DEPENDENT`: a CJK/composer/overprint field can exist in one Stable
  Illustrator text engine but not another. The writer records its actual DOM
  failure; it does not fabricate a value.
- `NOT_EXPOSED_BY_CLASSIC_DOM`: Classic ExtendScript provides no such property
  (notably font embedding permissions). It is reported as unavailable rather
  than being silently skipped.
- `INVALID_VALUE`: the Classic DOM property exists but the supplied scalar is
  outside Illustrator's allowed range or requires an enum that Classic DOM does
  not serialize from this API. It is not reported as a successful write.

`align_objects` is canvas geometry only and must not be used for paragraph
alignment. Direct local formatting is `set_typography`; named styles are
`apply_text_style`; text replacement remains `replace_formatted_text`; font
inventory/document font workflows remain separate; and non-text appearance is
`set_appearance`.
