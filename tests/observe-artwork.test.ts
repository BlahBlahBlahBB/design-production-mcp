import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDesignProductionMcpServer } from '../src/mcp/server.js';
import { observeArtworkSchema } from '../src/illustrator/core/ie3jp/tools/read/observe-artwork.js';

const root = process.cwd();
const source = readFileSync(`${root}/src/illustrator/core/ie3jp/tools/read/observe-artwork.ts`, 'utf8');
const registrySource = readFileSync(`${root}/src/illustrator/core/ie3jp/tools/registry.ts`, 'utf8');

test('observe_artwork is registered exactly once with its V1-only schema', () => {
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.ok(registered.observe_artwork, 'observe_artwork must be registered');
  assert.equal(Object.keys(registered).filter((name) => name === 'observe_artwork').length, 1);
  assert.equal((registrySource.match(/registerObserveArtwork\(server\)/g) ?? []).length, 1);
  assert.equal(observeArtworkSchema.safeParse({}).success, true);
  assert.equal(observeArtworkSchema.safeParse({ artboard_index: 0 }).success, true);
  assert.equal(observeArtworkSchema.safeParse({ artboard_index: -1 }).success, false);
  assert.equal(observeArtworkSchema.safeParse({ artboard_index: 0.5 }).success, false);
  assert.equal(observeArtworkSchema.safeParse({ artboard_index: 0, include_descendants: true }).success, false);
});

test('observe_artwork reads the active artboard by default and accepts an explicit index without activation', () => {
  assert.match(source, /doc\.artboards\.getActiveArtboardIndex\(\)/);
  assert.match(source, /params\.artboard_index !== undefined/);
  assert.match(source, /INVALID_ARTBOARD_INDEX/);
  assert.doesNotMatch(source, /setActiveArtboardIndex/);
});

test('observe_artwork traverses Layers and Sublayers but returns only direct roots in stable order', () => {
  assert.match(source, /for \(var i = 0; i < doc\.layers\.length; i\+\+\) walkLayer/);
  assert.match(source, /for \(var i = 0; i < layer\.layers\.length; i\+\+\)/);
  assert.match(source, /if \(item\.parent !== layer\) continue/);
  assert.match(source, /var itemIndex = directItemIndex\+\+/);
  assert.match(source, /appendDirectRoots\(layer, path, layerDepth, lineage\);[\s\S]*walkLayer\(layer\.layers\[i\], path, layerDepth \+ 1, lineage\)/);
  assert.doesNotMatch(source, /walkLayer\(item/);
  assert.doesNotMatch(source, /item\.pageItems/);
});

test('observe_artwork uses native UUIDs only and never writes fallback metadata', () => {
  assert.match(source, /_getNativeUUID\(item\)/);
  assert.match(source, /return uuid \? uuid : null/);
  assert.doesNotMatch(source, /ensureUUID/);
  assert.doesNotMatch(source, /\.note\s*=/);
  assert.doesNotMatch(source, /\.name\s*=/);
  assert.doesNotMatch(source, /setNoteMeta|_writeLegacyNoteUUID/);
});

test('observe_artwork includes hidden and locked direct roots with effective readable state', () => {
  assert.match(source, /item\.hidden === true/);
  assert.match(source, /layers\[i\]\.visible === false/);
  assert.match(source, /item\.locked === true/);
  assert.match(source, /layers\[i\]\.locked === true/);
  assert.match(source, /visible: state\.visible/);
  assert.match(source, /locked: state\.locked/);
  assert.doesNotMatch(source, /item\.hidden.*continue/);
  assert.doesNotMatch(source, /item\.locked.*continue/);
});

test('observe_artwork filters using geometric-center membership and returns plain bounded data', () => {
  assert.match(source, /getArtboardIndexForItem\(item\) === artboardIndex/);
  assert.match(source, /dpmReadBounds\(item, 'geometric'\)/);
  assert.match(source, /dpmNormalizeBounds\(selectedArtboard\.artboardRect\)/);
  assert.match(source, /layer_path: layerPath/);
  assert.match(source, /layer_depth: layerDepth/);
  assert.match(source, /item_index: itemIndex/);
  assert.match(source, /roots: roots,[\s\S]*count: roots\.length/);
  assert.doesNotMatch(source, /children:\s*/);
});

test('observe_artwork has no Illustrator state-changing setters', () => {
  assert.doesNotMatch(source, /doc\.selection\s*=(?!=)/);
  assert.doesNotMatch(source, /item\.selected\s*=(?!=)/);
  assert.doesNotMatch(source, /doc\.activeLayer\s*=(?!=)/);
  assert.doesNotMatch(source, /app\.coordinateSystem\s*=(?!=)/);
  assert.doesNotMatch(source, /\.save\s*\(/);
  assert.match(source, /executeToolJsx\(jsxCode, params, \{ activate: false \}\)/);
});
