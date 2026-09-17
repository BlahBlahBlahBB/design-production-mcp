import test from "node:test";
import assert from "node:assert/strict";
import { convertCoordinateForArtboards } from "../src/executor/coordinate-model.js";
import { asFindResult, matchesFindCriteria, validateFindCriteria } from "../src/executor/object-finding.js";
import { LocalIllustratorBridge } from "../src/executor/local-illustrator-bridge.js";
import type { ArtboardInfo, ObjectSummary } from "../src/executor/read-schema.js";
import type { ExecuteOptions, TransportResult } from "../src/executor/local-transport.js";

const artboards: ArtboardInfo[] = [
  { index: 0, name: "A", rect: [100, 500, 700, -100], width: 600, height: 600, active: true },
  { index: 1, name: "B", rect: [-50, 200, 350, -200], width: 400, height: 400, active: false },
];

function summary(name: string, typename = "TextFrame"): ObjectSummary {
  return {
    typename, name, layerPath: "0", ancestry: ["layer:0"], collectionPath: "layers/0/pageItems/0",
    locator: { kind: "document-session-structural", typename, name, layerPath: "0", ancestry: ["layer:0"], collectionPath: "layers/0/pageItems/0" },
    locked: false, hidden: false, bounds: null, contentsPreview: typename === "TextFrame" ? "简报标题" : null, contentsLength: typename === "TextFrame" ? 4 : null,
  };
}

class RecordingTransport {
  scripts: string[] = [];
  result: TransportResult<unknown> = { ok: true, value: [] };

  async execute<T>(script: string, _options?: ExecuteOptions): Promise<TransportResult<T>> {
    this.scripts.push(script);
    return this.result as TransportResult<T>;
  }
}

test("coordinate conversion maps artboard top-left and positive axes", () => {
  const origin = convertCoordinateForArtboards({ x: 0, y: 0, direction: "artboard-to-document" }, artboards);
  assert.deepEqual(origin, { ok: true, value: { input: { x: 0, y: 0, space: "artboard" }, output: { x: 100, y: 500, space: "document" }, artboardIndex: 0, artboardRect: [100, 500, 700, -100] } });
  const point = convertCoordinateForArtboards({ x: 25, y: 40, direction: "artboard-to-document" }, artboards);
  assert.deepEqual(point.ok && point.value.output, { x: 125, y: 460, space: "document" });
});

test("coordinate conversion supports offset artboards and round trips", () => {
  const forward = convertCoordinateForArtboards({ x: 12.5, y: 99.25, direction: "artboard-to-document", artboardIndex: 1 }, artboards);
  assert.equal(forward.ok, true);
  if (!forward.ok) return;
  const reverse = convertCoordinateForArtboards({ ...forward.value.output, direction: "document-to-artboard", artboardIndex: 1 }, artboards);
  assert.equal(reverse.ok, true);
  if (!reverse.ok) return;
  assert.ok(Math.abs(reverse.value.output.x - 12.5) < 1e-9);
  assert.ok(Math.abs(reverse.value.output.y - 99.25) < 1e-9);
});

test("coordinate conversion rejects invalid artboards", () => {
  assert.deepEqual(convertCoordinateForArtboards({ x: 0, y: 0, direction: "artboard-to-document", artboardIndex: 99 }, artboards), { ok: false, error: "INVALID_ARTBOARD_INDEX" });
});

test("find criteria supports exact, contains, type, layer, text, and status AND filters", () => {
  const candidate = { typename: "TextFrame", name: "@text:title", layerName: "Copy", layerPath: "0/1", contents: "简报标题", locked: false, hidden: false };
  assert.equal(matchesFindCriteria(candidate, { name: { value: "@text:title", mode: "exact" } }), true);
  assert.equal(matchesFindCriteria(candidate, { name: { value: "title", mode: "contains" }, typename: ["TextFrame", "PathItem"], layerName: "Copy", layerPath: "0/1", text: { value: "简报", mode: "contains" }, locked: false, hidden: false }), true);
  assert.equal(matchesFindCriteria(candidate, { typename: "PathItem" }), false);
  assert.equal(matchesFindCriteria(candidate, { text: { value: "不存在", mode: "contains" } }), false);
});

test("find result distinguishes zero, one, multiple, and max-result truncation", () => {
  const candidates = [
    { candidate: { typename: "TextFrame", name: "one", layerName: "Copy", layerPath: "0", contents: "一", locked: false, hidden: false }, summary: summary("one") },
    { candidate: { typename: "TextFrame", name: "two", layerName: "Copy", layerPath: "0", contents: "二", locked: false, hidden: false }, summary: summary("two") },
  ];
  assert.deepEqual(asFindResult(candidates, { name: { value: "missing", mode: "exact" } }, 10), { matchedCount: 0, results: [], truncated: false });
  assert.equal(asFindResult(candidates, { name: { value: "one", mode: "exact" } }, 10).matchedCount, 1);
  const multiple = asFindResult(candidates, { typename: "TextFrame" }, 1);
  assert.equal(multiple.matchedCount, 2);
  assert.equal(multiple.results.length, 1);
  assert.equal(multiple.truncated, true);
});

test("find criteria rejects empty or malformed input", () => {
  assert.equal(validateFindCriteria({}), "INVALID_FIND_CRITERIA");
  assert.equal(validateFindCriteria({ name: { value: "", mode: "exact" } }), "INVALID_FIND_CRITERIA");
  assert.equal(validateFindCriteria({ typename: [] }), "INVALID_FIND_CRITERIA");
});

test("A2 bridge operations use bounded traversal and structured errors", async () => {
  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  await bridge.getGroups({ maxDepth: 2, maxObjects: 3 });
  assert.match(transport.scripts[0], /OBJECT_TRAVERSAL_LIMIT/);
  assert.match(transport.scripts[0], /item\.typename !== 'GroupItem'/);
  await bridge.getDocumentStructure({ maxDepth: 1, maxObjects: 2 });
  assert.match(transport.scripts[1], /typename: 'Layer'/);
  assert.match(transport.scripts[1], /contents\.length > 160/);
  await bridge.findObjects({ typename: "TextFrame", text: { value: "简", mode: "contains" } }, { maxResults: 1 });
  assert.match(transport.scripts[2], /MAX_RESULTS/);
  assert.match(transport.scripts[2], /criteria\.text/);
  const invalid = await bridge.findObjects({});
  assert.deepEqual(invalid, { ok: false, error: "INVALID_FIND_CRITERIA" });
  assert.equal(transport.scripts.length, 3);
});

test("A2 bridge preserves no-document failures", async () => {
  const transport = new RecordingTransport();
  transport.result = { ok: false, error: { code: "JSX_ERROR", message: "NO_ACTIVE_DOCUMENT" } };
  const bridge = new LocalIllustratorBridge(transport);
  const result = await bridge.getGroups();
  assert.deepEqual(result, { ok: false, error: "JSX_ERROR: NO_ACTIVE_DOCUMENT" });
});
