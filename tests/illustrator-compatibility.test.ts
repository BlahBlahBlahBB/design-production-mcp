import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPATIBILITY_CAPABILITIES,
  classifyIllustratorSupport,
  sanitizeCompatibilityReport,
} from '../src/compat/illustrator-compatibility.js';

test('compatibility policy marks only Illustrator 30.8.1 maintainer verified', () => {
  assert.deepEqual(classifyIllustratorSupport('26.0.0'), { targetYear: 2022, supportStatus: 'SUPPORTED_UNVERIFIED' });
  assert.deepEqual(classifyIllustratorSupport('27.9.0'), { targetYear: 2023, supportStatus: 'SUPPORTED_UNVERIFIED' });
  assert.deepEqual(classifyIllustratorSupport('28.0.0'), { targetYear: 2024, supportStatus: 'SUPPORTED_UNVERIFIED' });
  assert.deepEqual(classifyIllustratorSupport('29.9.0'), { targetYear: 2025, supportStatus: 'SUPPORTED_UNVERIFIED' });
  assert.deepEqual(classifyIllustratorSupport('30.8.1'), { targetYear: 2026, supportStatus: 'MAINTAINER_VERIFIED' });
  assert.equal(classifyIllustratorSupport('31.0.0').supportStatus, 'OUT_OF_TARGET');
});

test('Classic DOM warning no longer implies 2024+ was maintainer verified', () => {
  const common = readFileSync(new URL('../../src/illustrator/core/ie3jp/jsx/helpers/common.jsx', import.meta.url), 'utf8');
  assert.match(common, /VERIFIED_ILLUSTRATOR_VERSION = "30\.8\.1"/);
  assert.match(common, /Illustrator 2022–2025 remain supported but unverified/);
  assert.doesNotMatch(common, /tested only on Illustrator 2024/);
});

test('compatibility report sanitizer keeps only safe allowlisted metadata and capability states', () => {
  const fakePath = '/' + ['Us', 'ers'].join('') + '/private/sample.ai';
  const fakeCredential = 'dummy-' + 'credential';
  const report = sanitizeCompatibilityReport({
    mcp_version: '0.4.0',
    platform: 'darwin',
    node_version: 'v22.12.0',
    illustrator_version: '30.8.1',
    illustrator_internal_version: '30.8.1',
    timestamp: '2026-09-18T01:00:00.000Z',
    capabilities: {
      illustrator_connection: 'PASS',
      native_uuid: 'PASS',
      leaked_path: fakePath,
      export_tempfile: 'PASS',
    },
    username: 'private-user',
    document_contents: 'private text',
    token: fakeCredential,
  } as never);
  const serialized = JSON.stringify(report);
  assert.equal(report.capabilities.illustrator_connection, 'PASS');
  assert.equal(report.capabilities.export_tempfile, 'PASS');
  assert.equal(Object.keys(report.capabilities).length, COMPATIBILITY_CAPABILITIES.length);
  assert.equal('username' in report, false);
  assert.equal('document_contents' in report, false);
  assert.equal(serialized.includes(fakePath), false);
  assert.equal(serialized.includes(fakeCredential), false);
  assert.doesNotMatch(serialized, /private-user|private text|leaked_path/);
});

test('compatibility report replaces malformed version strings rather than leaking paths or secrets', () => {
  const fakePath = '/' + ['Us', 'ers'].join('') + '/alice/.codex/' + 'dummy-credential';
  const report = sanitizeCompatibilityReport({
    mcp_version: fakePath,
    platform: 'darwin',
    node_version: 'v22.12.0',
    illustrator_version: 'dummy-credential-value',
    illustrator_internal_version: '30.8.1',
    timestamp: 'invalid',
    capabilities: {},
  });
  assert.equal(report.mcp_version, 'unknown');
  assert.equal(report.illustrator_version, 'unknown');
  assert.equal(JSON.stringify(report).includes(fakePath), false);
  assert.equal(report.timestamp, '1970-01-01T00:00:00.000Z');
  assert.ok(Object.values(report.capabilities).every((value) => value === 'SKIPPED'));
});
