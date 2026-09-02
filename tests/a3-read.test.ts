import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeColorInspectionOptions,
  normalizeFontListOptions,
  normalizeFonts,
  normalizeImageInspectionOptions,
} from "../src/executor/inspection-read.js";
import { LocalIllustratorBridge } from "../src/executor/local-illustrator-bridge.js";
import type { ExecuteOptions, TransportResult } from "../src/executor/local-transport.js";

class RecordingTransport {
  scripts: string[] = [];
  result: TransportResult<unknown> = { ok: true, value: {} };

  async execute<T>(script: string, _options?: ExecuteOptions): Promise<TransportResult<T>> {
    this.scripts.push(script);
    return this.result as TransportResult<T>;
  }
}

test("A3 validates color and image inspection limits before transport execution", async () => {
  assert.equal(normalizeColorInspectionOptions({ maxDepth: 3, maxObjects: 1, maxColors: 2 })?.maxColors, 2);
  assert.equal(normalizeColorInspectionOptions({ maxObjects: 0 }), null);
  assert.equal(normalizeColorInspectionOptions({ maxDepth: 0 }), null);
  assert.equal(normalizeImageInspectionOptions({ maxDepth: 3, maxObjects: 2, maxImages: 3 })?.maxImages, 3);
  assert.equal(normalizeImageInspectionOptions({ maxImages: 0 }), null);

  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  assert.deepEqual(await bridge.getColors({ maxColors: 0 }), { ok: false, error: "INVALID_COLOR_INSPECTION_OPTIONS" });
  assert.deepEqual(await bridge.getImages({ maxObjects: 0 }), { ok: false, error: "INVALID_IMAGE_INSPECTION_OPTIONS" });
  assert.equal(transport.scripts.length, 0);
});

test("getColors isolates all color models and keeps bounded artwork traversal", async () => {
  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  await bridge.getColors({ maxObjects: 8, maxColors: 4 });
  const script = transport.scripts[0];
  for (const colorType of ["RGBColor", "CMYKColor", "GrayColor", "SpotColor", "GradientColor", "NoColor"]) {
    assert.match(script, new RegExp(colorType));
  }
  assert.match(script, /spotBaseColor/);
  assert.match(script, /gradientStopsTruncated/);
  assert.match(script, /OBJECT_TRAVERSAL_LIMIT/);
  assert.match(script, /MAX_DEPTH/);
  assert.match(script, /MAX_COLORS/);
  assert.match(script, /item\.textRange\.characterAttributes\.fillColor/);
  assert.match(script, /function copyColor\(color, depth\)/);
  assert.match(script, /if \(depth >= 2\) return out/);
  assert.match(script, /color: copyColor\(color, 0\)/);
  assert.doesNotMatch(script, /references\.push\(\{ source: source, swatchName: null, locator: .* color: color \}\)/);
  assert.match(script, /if \(app\.documents\.length === 0\) throw new Error\('NO_DOCUMENT'\)/);
});

test("getColors preserves a partial result when an optional color property fails", async () => {
  const transport = new RecordingTransport();
  transport.result = {
    ok: true,
    value: {
      swatches: [],
      usedColors: [{ colorModel: "RGB", rgb: { red: 1, green: 2, blue: 3 }, referenceCount: 1 }],
      diagnostics: { swatchesRead: 0, usedReferencesRead: 1, optionalPropertyFailures: 1 },
      objectsScanned: 1,
      maxObjectsScanned: 2,
      truncated: false,
      truncationReason: null,
    },
  };
  const result = await new LocalIllustratorBridge(transport).getColors({ maxObjects: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.value?.diagnostics.optionalPropertyFailures, 1);
  assert.equal(result.value?.usedColors.length, 1);
});

test("getImages covers linked, embedded, broken, and unsupported image metadata without writes", async () => {
  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  await bridge.getImages({ maxObjects: 8, maxImages: 2 });
  const script = transport.scripts[0];
  assert.match(script, /typename === 'PlacedItem' \|\| typename === 'RasterItem'/);
  assert.match(script, /info\.fileExists = file\.exists/);
  assert.match(script, /info\.brokenLink = true/);
  assert.match(script, /intrinsicPixelsSupported: false/);
  assert.match(script, /effectivePpiSupported: false/);
  assert.match(script, /ImageColorSpace/);
  assert.match(script, /MAX_IMAGES/);
  assert.match(script, /OBJECT_TRAVERSAL_LIMIT/);
  assert.match(script, /MAX_DEPTH/);
  assert.doesNotMatch(script, /\.save\(|saveAs|exportFile|\.remove\(|\.add\(/);
});

test("getImages returns a broken-link record without failing the document result", async () => {
  const transport = new RecordingTransport();
  transport.result = {
    ok: true,
    value: {
      linked: [{ typename: "PlacedItem", status: "linked", brokenLink: true, effectivePpi: null, effectivePpiSupported: false }],
      embedded: [],
      all: [{ typename: "PlacedItem", status: "linked", brokenLink: true, effectivePpi: null, effectivePpiSupported: false }],
      diagnostics: { brokenLinks: 1, optionalPropertyFailures: 1 },
      objectsScanned: 1,
      maxObjectsScanned: 2,
      truncated: false,
      truncationReason: null,
    },
  };
  const result = await new LocalIllustratorBridge(transport).getImages({ maxImages: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.value?.diagnostics.brokenLinks, 1);
  assert.equal(result.value?.all[0]?.effectivePpiSupported, false);
});

test("font normalization needs no document, is stable, deduplicated, searchable, and bounded", async () => {
  const options = normalizeFontListOptions({ search: "arial", maxResults: 1 });
  assert.ok(options);
  const result = normalizeFonts([
    { postScriptName: "Arial-BoldMT", family: "Arial", style: "Bold", typename: "TextFont" },
    { postScriptName: "ArialMT", family: "Arial", style: "Regular", typename: "TextFont" },
    { postScriptName: "arialmt", family: "Arial", style: "Regular", typename: "TextFont" },
    { postScriptName: "CourierNewPSMT", family: "Courier New", style: "Regular", typename: "TextFont" },
  ], options);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.postScriptName, "Arial-BoldMT");
  assert.equal(result.truncated, true);
  assert.equal(normalizeFonts([{ postScriptName: "ArialMT" }], normalizeFontListOptions({ search: "missing" })!).matchedCount, 0);
  assert.equal(normalizeFontListOptions({ maxResults: 0 }), null);
});

test("listFonts uses app-level enumeration rather than requiring an active document", async () => {
  const transport = new RecordingTransport();
  transport.result = {
    ok: true,
    value: {
      totalAvailable: 3,
      fonts: [
        { postScriptName: "Beta", family: "Family", style: "Regular", typename: "TextFont" },
        { postScriptName: "Alpha", family: "Family", style: "Bold", typename: "TextFont" },
      ],
    },
  };
  const result = await new LocalIllustratorBridge(transport).listFonts({ search: "family", maxResults: 10 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value?.results.map((font) => font.postScriptName), ["Alpha", "Beta"]);
  assert.equal(result.value?.totalAvailable, 3);
  assert.equal(result.value?.search, "family");
  assert.match(transport.scripts[0], /app\.textFonts/);
  assert.doesNotMatch(transport.scripts[0], /app\.documents\.length/);
});

test("A3 structured no-document and font enumeration failures remain isolated", async () => {
  const noDocument = new RecordingTransport();
  noDocument.result = { ok: false, error: { code: "JSX_ERROR", message: "NO_DOCUMENT" } };
  assert.deepEqual(await new LocalIllustratorBridge(noDocument).getImages(), { ok: false, error: "JSX_ERROR: NO_DOCUMENT" });

  const fontFailure = new RecordingTransport();
  fontFailure.result = { ok: false, error: { code: "JSX_ERROR", message: "FONT_ENUMERATION_FAILED" } };
  assert.deepEqual(await new LocalIllustratorBridge(fontFailure).listFonts(), { ok: false, error: "JSX_ERROR: FONT_ENUMERATION_FAILED" });
});
