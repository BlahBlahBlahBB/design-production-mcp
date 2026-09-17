import test from "node:test";
import assert from "node:assert/strict";
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

test("document info returns the bridge schema", async () => {
  const transport = new RecordingTransport();
  transport.result = {
    ok: true,
    value: {
      name: "test.ai", path: "/tmp/test.ai", saved: true, modified: null, modifiedSupported: false,
      colorSpace: "DocumentColorSpace.RGB", width: 100, height: 50, rulerUnits: "RulerUnits.Points",
      artboardCount: 1, layerCount: 2, textFrameCount: 3, placedImageCount: 4, activeArtboardIndex: 0,
    },
  };
  const bridge = new LocalIllustratorBridge(transport);
  const result = await bridge.getDocumentInfo();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, transport.result.value);
  assert.match(transport.scripts[0], /modifiedSupported/);
  assert.match(transport.scripts[0], /typeof modifiedValue === 'boolean'/);
  assert.match(transport.scripts[0], /placedImageCount/);
});

test("read operations preserve structured no-document errors", async () => {
  const transport = new RecordingTransport();
  transport.result = { ok: false, error: { code: "JSX_ERROR", message: "NO_DOCUMENT" } };
  const bridge = new LocalIllustratorBridge(transport);
  const result = await bridge.getArtboards();
  assert.deepEqual(result, { ok: false, error: "JSX_ERROR: NO_DOCUMENT" });
});

test("text frame summaries isolate optional legacy properties", async () => {
  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  await bridge.listTextFrames();
  assert.match(transport.scripts[0], /overflowSupported: false/);
  assert.match(transport.scripts[0], /typeof overflowValue === 'boolean'/);
  assert.match(transport.scripts[0], /try \{ item\.fontFamily = a\.textFont\.family/);
});

test("text frame detail targets a deterministic index", async () => {
  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  await bridge.getTextFrameDetail({ index: 2 });
  assert.match(transport.scripts[0], /targetIndex = 2/);
  assert.match(transport.scripts[0], /TEXT_FRAME_INDEX_OUT_OF_RANGE/);
});

test("text frame detail targets a unique object name", async () => {
  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  await bridge.getTextFrameDetail({ name: "@text:title" });
  assert.match(transport.scripts[0], /targetName = "@text:title"/);
  assert.match(transport.scripts[0], /TEXT_FRAME_NAME_AMBIGUOUS/);
  assert.match(transport.scripts[0], /TEXT_FRAME_NOT_FOUND_BY_NAME/);
});

test("text frame detail rejects an invalid index before transport execution", async () => {
  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  const result = await bridge.getTextFrameDetail({ index: -1 });
  assert.deepEqual(result, { ok: false, error: "INVALID_TEXT_FRAME_INDEX" });
  assert.equal(transport.scripts.length, 0);
});

test("text frame detail rejects an ambiguous target before transport execution", async () => {
  const transport = new RecordingTransport();
  const bridge = new LocalIllustratorBridge(transport);
  const result = await bridge.getTextFrameDetail({ index: 0, name: "@text:title" } as never);
  assert.deepEqual(result, { ok: false, error: "AMBIGUOUS_TEXT_FRAME_TARGET" });
  assert.equal(transport.scripts.length, 0);
});

test("text frame detail surfaces an unknown named target", async () => {
  const transport = new RecordingTransport();
  transport.result = { ok: false, error: { code: "JSX_ERROR", message: "TEXT_FRAME_NOT_FOUND_BY_NAME:@text:title" } };
  const bridge = new LocalIllustratorBridge(transport);
  const result = await bridge.getTextFrameDetail({ name: "@text:title" });
  assert.deepEqual(result, { ok: false, error: "JSX_ERROR: TEXT_FRAME_NOT_FOUND_BY_NAME:@text:title" });
});
