import { executeJsx, executeJsxHeavy } from '../executor/jsx-runner.js';
import { resolveCoordinateSystem } from './session.js';

type ToolParams = Record<string, unknown>;

function ensureToolParams(params: unknown): ToolParams {
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    return params as ToolParams;
  }
  return {};
}

export function formatToolResult(result: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

export async function executeToolJsx(
  jsxCode: string,
  params: unknown,
  options?: { activate?: boolean; heavy?: boolean; resolveCoordinate?: boolean; timeoutMs?: number },
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const baseParams = ensureToolParams(params);
  const resolvedParams = options?.resolveCoordinate
    ? { ...baseParams, coordinate_system: await resolveCoordinateSystem(baseParams.coordinate_system as 'artboard-web' | 'document' | undefined) }
    : baseParams;

  const result = typeof options?.timeoutMs === 'number'
    ? await executeJsx(jsxCode, resolvedParams, { timeout: options.timeoutMs, activate: options?.activate ?? false })
    : options?.heavy
      ? await executeJsxHeavy(jsxCode, resolvedParams, { activate: options?.activate ?? false })
      : await executeJsx(jsxCode, resolvedParams, { activate: options?.activate ?? false });

  return formatToolResult(result);
}
