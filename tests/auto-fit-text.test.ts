import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDesignProductionMcpServer } from '../src/mcp/server.js';
import { autoFitTextSchema } from '../src/illustrator/core/ie3jp/tools/modify/auto-fit-text.js';

const root = process.cwd();
const source = readFileSync(`${root}/src/illustrator/core/ie3jp/tools/modify/auto-fit-text.ts`, 'utf8');
const geometry = readFileSync(`${root}/src/illustrator/core/ie3jp/tools/geometry.ts`, 'utf8');

test('auto_fit_text is registered with the exact Wave 1 schema', () => {
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.ok(registered.auto_fit_text, 'auto_fit_text must be registered');
  assert.equal(autoFitTextSchema.safeParse({ target_uuid: 'uuid', min_font_size: 8, max_font_size: 12 }).success, true);
  assert.equal(autoFitTextSchema.safeParse({ target_uuid: 'uuid', min_font_size: 12, max_font_size: 8 }).success, false);
  assert.equal(autoFitTextSchema.safeParse({ target_uuid: 'uuid', min_font_size: 0, max_font_size: 8 }).success, false);
  assert.equal(autoFitTextSchema.safeParse({ target_uuid: 'uuid', min_font_size: 8, max_font_size: 12, mode: 'fill' }).success, false);
});

test('auto_fit_text is AreaText-only and fail-closed before mutation', () => {
  assert.match(source, /getTextKind\(target\) !== "area"/);
  assert.match(source, /target\.locked \|\| target\.hidden/);
  assert.match(source, /target\.editable !== true/);
  assert.match(source, /Text frame contents are empty or unreadable/);
  assert.match(source, /Font size is mixed across the text frame/);
  assert.match(source, /Font is missing at index/);
  assert.match(source, /FAILED_NO_MUTATION/);
});

test('auto_fit_text uses one bounded background JSX solver with a verified restore path', () => {
  assert.equal((source.match(/executeToolJsx\(/g) ?? []).length, 1);
  assert.match(source, /MAX_SOLVER_ITERATIONS = 16/);
  assert.match(source, /while \(\(high - low\) > SIZE_PRECISION_PT && iterations < MAX_SOLVER_ITERATIONS - 1\)/);
  assert.match(source, /timeoutMs: 60_000/);
  assert.match(source, /includeTiming: true/);
  assert.match(source, /NO_FIT_IN_RANGE/);
  assert.match(source, /originalSize = originalState\.size/);
  assert.match(source, /originalOverset = readAreaTextFitState\(target\)\.overset/);
  assert.match(source, /restoreOriginal\(target, originalSize, originalOverset, originalInvariant\)/);
  assert.match(source, /ROLLBACK_VERIFIED/);
  assert.match(source, /RESTORATION_UNVERIFIED/);
  assert.match(source, /FINAL_VERIFICATION_FAILED/);
  assert.match(source, /has_text_overflow_first_read/);
  assert.match(source, /has_text_overflow_second_read/);
  assert.match(source, /content_and_leading_unchanged/);
  assert.doesNotMatch(source, /activate:\s*true/);
  assert.doesNotMatch(source, /doScript\s*\(/);
});

test('auto_fit_text preserves authored leading semantics across font-size changes', () => {
  assert.match(source, /font_names:fontNames/);
  assert.match(source, /auto_leading:autoLeading/);
  assert.match(source, /leading_readable:leadingReadable/);
  assert.match(source, /original\.auto_leading\[ci\] === false/);
  assert.match(source, /closeEnough\(original\.leading\[ci\], current\.leading\[ci\]\)/);
  assert.match(source, /original\.leading_readable\[ci\] && !current\.leading_readable\[ci\]/);
  assert.match(source, /typography_preserved = invariantMatches\(tf, originalInvariant\)/);
  assert.doesNotMatch(source, /characterAttributes\.leading\s*=/);
  assert.doesNotMatch(source, /characterAttributes\.autoLeading\s*=/);
});

test('auto_fit_text derives overset from visible AreaText lines, not TextFrame.overflows', () => {
  assert.match(source, /function readAreaTextFitState\(tf\)/);
  assert.match(source, /var lines = tf\.lines/);
  assert.match(source, /var lastVisibleEnd = lastLine \? lastLine\.end : null/);
  assert.match(source, /var completeEnd = complete \? complete\.end : null/);
  assert.match(source, /visible_lines_text_range_end/);
  assert.match(source, /ignoredTerminalReturn/);
  assert.doesNotMatch(source, /tf\.overflows\b/);
  assert.doesNotMatch(source, /duplicate\s*\(/i);
  assert.doesNotMatch(source, /convert.*point/i);
});

test('auto_fit_text limits mutations to font size and keeps geometry policy explicit', () => {
  assert.match(source, /characterAttributes\.size = requestedSize/);
  assert.doesNotMatch(source, /characterAttributes\.leading\s*=/);
  assert.doesNotMatch(source, /characterAttributes\.autoLeading\s*=/);
  assert.doesNotMatch(source, /\.contents\s*=(?!=)/);
  assert.match(source, /readOptionalBounds\(target, "geometric"\)/);
  assert.match(source, /readOptionalBounds\(tf, "visible"\)/);
  assert.match(geometry, /policy !== "geometric" && policy !== "visible"/);
  assert.match(geometry, /dpmNormalizeBounds/);
  assert.match(geometry, /dpmBoundsMatch/);
});

test('existing typography tools remain isolated from auto_fit_text', () => {
  const typography = readFileSync(`${root}/src/illustrator/core/ie3jp/tools/typography-core.ts`, 'utf8');
  assert.doesNotMatch(typography, /auto_fit_text/);
  assert.match(typography, /set_typography/);
  assert.match(typography, /get_typography_metrics/);
});
