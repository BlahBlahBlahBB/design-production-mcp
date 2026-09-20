import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { WRITE_ANNOTATIONS, coerceBoolean } from './shared.js';

const groupSchema = z.object({
  uuids: z.array(z.string()).min(1),
  name: z.string().optional(),
  clipped: coerceBoolean.optional().default(false),
});

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else {
  try {
    var params = readParamsFile(PARAMS_PATH);
    var results = [], failed = [];

    for (var gi = 0; gi < params.groups.length; gi++) {
      var op = params.groups[gi];
      try {
        var items = [], missing = [];
        for (var ui = 0; ui < op.uuids.length; ui++) {
          var item = findItemByUUID(op.uuids[ui]);
          if (item) items.push(item);
          else missing.push(op.uuids[ui]);
        }
        if (missing.length) {
          failed.push({ index:gi, reason:"Missing UUIDs", uuids:missing });
          results.push({ index:gi, success:false, missing_uuids:missing });
          continue;
        }

        var parentLayer = items[0].layer;
        var group = parentLayer.groupItems.add();
        for (var ii = 0; ii < items.length; ii++) items[ii].move(group, ElementPlacement.PLACEATEND);
        if (op.name) group.name = op.name;
        if (op.clipped === true) group.clipped = true;

        results.push({
          index:gi,
          success:true,
          uuid:ensureUUID(group),
          childCount:group.pageItems.length,
          clipped:group.clipped,
          verified:verifyItem(group)
        });
      } catch(e) {
        failed.push({ index:gi, reason:e.message });
        results.push({ index:gi, success:false, error:e.message });
      }
    }

    writeResultFile(RESULT_PATH, {
      success: failed.length === 0,
      requested_count: params.groups.length,
      success_count: params.groups.length - failed.length,
      fail_count: failed.length,
      failed_groups: failed,
      results: results
    });
  } catch(e) {
    writeResultFile(RESULT_PATH, { error:true, message:"group_object_sets failed: " + e.message, line:e.line });
  }
}
`;

export function register(server: McpServer): void {
  server.registerTool('group_object_sets', {
    title: 'Group Object Sets',
    description: 'Create many independent groups or clipping groups in one background JSX execution. Prefer this over repeated group_objects calls when a template has many repeated slots. For clipped groups, UUID order is bottom-to-top and the last UUID becomes the clipping path.',
    inputSchema: {
      groups: z.array(groupSchema).min(1).max(200),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params));
}
