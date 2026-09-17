import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildExpandAction, buildPathfinderAction } from "../legacy/donor-backed/actions.js";
import { directDonorJsx } from "./direct-donor.js";
import { executeToolJsx } from "./ie3jp/tools/tool-executor.js";
import { WRITE_ANNOTATIONS } from "./ie3jp/tools/modify/shared.js";

/** Direct wrappers over Alexander Ladygin's fixed Action implementations. */
export function registerAlexanderTools(server: McpServer): void {
  server.registerTool(
    "expand_objects",
    {
      title: "Expand Objects",
      description: "Run Illustrator Object > Expand on the current selection with explicit component controls.",
      inputSchema: {
        object: z.boolean().optional(), fill: z.boolean().optional(), stroke: z.boolean().optional(), gradient: z.boolean().optional(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (options) => executeToolJsx(directDonorJsx("Object > Expand", buildExpandAction(options)), options, { activate: true }),
  );
  server.registerTool(
    "pathfinder_objects",
    {
      title: "Pathfinder",
      description: "Run one fixed Pathfinder mode on the current Illustrator selection.",
      inputSchema: { mode: z.enum(["unite", "minus_front", "minus_back", "intersect", "exclude", "divide", "trim", "merge", "crop", "outline"]) },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ mode }) => executeToolJsx(directDonorJsx("Pathfinder", buildPathfinderAction(mode)), { mode }, { activate: true }),
  );
}
