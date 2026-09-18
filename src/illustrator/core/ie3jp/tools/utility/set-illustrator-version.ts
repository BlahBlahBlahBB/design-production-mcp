import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { setAppVersion, getAppVersion } from '../../executor/jsx-runner.js';
import { WRITE_IDEMPOTENT_ANNOTATIONS } from '../modify/shared.js';

export function register(server: McpServer): void {
  server.registerTool(
    'set_illustrator_version',
    {
      title: 'Set Illustrator Version',
      description:
        'Diagnostic routing hint only. Stable is the default; do not call merely to confirm connectivity. ' +
        'Supported target years are 2022–2026. On a machine with one installed/running Stable version, ordinary Core operations use that instance. ' +
        'macOS AppleEvents use a shared Stable bundle id, so multiple simultaneously running Stable versions cannot be reliably distinguished; Windows COM also cannot select among multiple versions. ' +
        'This tool never selects Beta and does not claim exact multi-instance routing. Use clear: true to return to the detected single-Stable default.',
      inputSchema: {
        version: z
          .enum(['2022', '2023', '2024', '2025', '2026'])
          .optional()
          .describe('Supported Illustrator target year (2022–2026). Exact routing is not guaranteed when multiple Stable instances are running.'),
        clear: z
          .boolean()
          .optional()
          .describe('Reset to default behavior (connect to any running Illustrator).'),
      },
      annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    },
    async (params) => {
      if (params.clear) {
        setAppVersion(undefined);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'cleared',
              message: 'Illustrator target reset to the detected Stable default.',
            }),
          }],
        };
      }

      if (!params.version) {
        const current = getAppVersion();
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              currentVersion: current ?? null,
              message: current
                ? `Illustrator ${current} Stable is the current target hint.`
                : 'No installed target path detected; using the default Stable Illustrator AppleEvent/COM target.',
            }),
          }],
        };
      }

      setAppVersion(params.version);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'set',
            version: params.version,
            message: `Illustrator ${params.version} Stable target hint set. Multi-instance routing is not guaranteed.`,
          }),
        }],
      };
    },
  );
}
