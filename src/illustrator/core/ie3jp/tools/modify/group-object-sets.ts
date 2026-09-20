import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { WRITE_ANNOTATIONS } from './shared.js';

const groupSchema = z.object({
  uuids: z.array(z.string()).min(1).describe('Content UUIDs to place inside the group.'),
  clip_path_uuid: z.string().optional().describe('Optional simple PathItem UUID to use as the clipping path.'),
  name: z.string().optional(),
});

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else {
  try {
    var params = readParamsFile(PARAMS_PATH);
    var prepared = [], preflightFailures = [], results = [], failed = [];

    // Validate every target before moving any existing artwork.
    for (var pi = 0; pi < params.groups.length; pi++) {
      var pop = params.groups[pi], prep = { op:pop, items:[], clipPath:null };
      try {
        for (var ui = 0; ui < pop.uuids.length; ui++) {
          var item = findItemByUUID(pop.uuids[ui]);
          if (!item) throw new Error("Missing UUID: " + pop.uuids[ui]);
          if (item.locked || item.hidden) throw new Error("Content item must be unlocked and visible: " + pop.uuids[ui]);
          prep.items.push(item);
        }
        if (pop.clip_path_uuid) {
          prep.clipPath = findItemByUUID(pop.clip_path_uuid);
          if (!prep.clipPath) throw new Error("Clip path not found: " + pop.clip_path_uuid);
          if (prep.clipPath.typename !== "PathItem") throw new Error("clip_path_uuid must resolve to a simple PathItem");
          if (prep.clipPath.locked || prep.clipPath.hidden) throw new Error("Clip path must be unlocked and visible");
        }
        prepared.push(prep);
      } catch(prepError) {
        preflightFailures.push({ index:pi, reason:prepError.message });
      }
    }

    if (preflightFailures.length) {
      writeResultFile(RESULT_PATH, {
        success:false,
        preflight:"FAILED_NO_MUTATION",
        requested_count:params.groups.length,
        success_count:0,
        fail_count:preflightFailures.length,
        failed_groups:preflightFailures,
        results:[]
      });
    } else {
      for (var gi = 0; gi < prepared.length; gi++) {
        var p = prepared[gi], op = p.op, group = null;
        try {
          var parentLayer = p.clipPath ? p.clipPath.layer : p.items[0].layer;
          group = parentLayer.groupItems.add();

          if (p.clipPath) {
            // Illustrator requires the clipping PathItem at the beginning/front.
            p.clipPath.move(group, ElementPlacement.PLACEATBEGINNING);
            p.clipPath.clipping = true;
          }

          for (var ii = 0; ii < p.items.length; ii++) {
            p.items[ii].move(group, ElementPlacement.PLACEATEND);
          }

          if (p.clipPath) group.clipped = true;
          if (op.name) group.name = op.name;

          results.push({
            index:gi,
            success:true,
            uuid:ensureUUID(group),
            childCount:group.pageItems.length,
            clipped:p.clipPath ? true : false,
            verified:verifyItem(group)
          });
        } catch(e) {
          failed.push({ index:gi, reason:e.message });
          results.push({ index:gi, success:false, error:e.message });
        }
      }

      writeResultFile(RESULT_PATH, {
        success: failed.length === 0,
        preflight:"PASS",
        requested_count: params.groups.length,
        success_count: params.groups.length - failed.length,
        fail_count: failed.length,
        failed_groups: failed,
        results: results
      });
    }
  } catch(e) {
    writeResultFile(RESULT_PATH, { error:true, message:"group_object_sets failed: " + e.message, line:e.line });
  }
}
`;

export function register(server: McpServer): void {
  server.registerTool('group_object_sets', {
    title: 'Group Object Sets',
    description: 'Create many independent groups or clipping groups in one background JSX execution. Prefer this over repeated group_objects calls when a template has many repeated slots. For clipping groups, pass content UUIDs in uuids and the mask separately as clip_path_uuid; the tool moves the simple PathItem mask to Illustrator-safe PLACEATBEGINNING and marks it as clipping.',
    inputSchema: {
      groups: z.array(groupSchema).min(1).max(200),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params));
}
