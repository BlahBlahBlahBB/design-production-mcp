export type CapabilityStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'VERSION_DEPENDENT';
export type IllustratorSupportStatus = 'SUPPORTED_UNVERIFIED' | 'MAINTAINER_VERIFIED' | 'COMMUNITY_VERIFIED' | 'OUT_OF_TARGET';

export const COMPATIBILITY_CAPABILITIES = [
  'illustrator_connection',
  'document_create_read',
  'native_uuid',
  'cross_jsx_uuid_lookup',
  'shape_create_read',
  'text_create_read',
  'typography_basic',
  'paragraph_alignment',
  'mixed_han_latin_typography',
  'appearance',
  'batch_move',
  'layers',
  'artboards',
  'export_tempfile',
  'expand_representative',
  'pathfinder_representative',
  'place_image_fixture',
] as const;

export interface CompatibilityReportInput {
  mcp_version: string;
  platform: string;
  node_version: string;
  illustrator_version: string;
  illustrator_internal_version: string;
  timestamp: string;
  capabilities: Record<string, unknown>;
}

const CAPABILITY_STATUS = new Set<CapabilityStatus>(['PASS', 'FAIL', 'SKIPPED', 'VERSION_DEPENDENT']);
const SAFE_VERSION = /^(?:v)?\d{1,3}(?:\.\d{1,3}){0,3}$/;

function safeVersion(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_VERSION.test(value)) return 'unknown';
  return value;
}

function safePlatform(value: unknown): string {
  return value === 'darwin' || value === 'win32' ? value : 'unknown';
}

export function classifyIllustratorSupport(internalVersion: string): {
  targetYear: number | null;
  supportStatus: IllustratorSupportStatus;
} {
  const major = Number.parseInt(internalVersion.split('.')[0] ?? '', 10);
  if (major < 26 || major > 30 || !Number.isFinite(major)) {
    return { targetYear: null, supportStatus: 'OUT_OF_TARGET' };
  }
  const targetYear = major + 1996;
  return {
    targetYear,
    supportStatus: internalVersion === '30.8.1' ? 'MAINTAINER_VERIFIED' : 'SUPPORTED_UNVERIFIED',
  };
}

/** Selects only whitelisted, non-sensitive data for the on-disk report. */
export function sanitizeCompatibilityReport(input: CompatibilityReportInput): CompatibilityReportInput {
  const timestamp = typeof input.timestamp === 'string' && !Number.isNaN(Date.parse(input.timestamp))
    ? new Date(input.timestamp).toISOString()
    : new Date(0).toISOString();
  const capabilities: Record<string, CapabilityStatus> = {};
  for (const capability of COMPATIBILITY_CAPABILITIES) {
    const value = input.capabilities?.[capability];
    capabilities[capability] = CAPABILITY_STATUS.has(value as CapabilityStatus)
      ? value as CapabilityStatus
      : 'SKIPPED';
  }
  return {
    mcp_version: safeVersion(input.mcp_version),
    platform: safePlatform(input.platform),
    node_version: safeVersion(input.node_version),
    illustrator_version: safeVersion(input.illustrator_version),
    illustrator_internal_version: safeVersion(input.illustrator_internal_version),
    timestamp,
    capabilities,
  };
}
