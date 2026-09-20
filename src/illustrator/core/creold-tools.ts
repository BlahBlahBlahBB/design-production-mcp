import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildBacklogOperationJsx } from "../legacy/donor-backed/backlog-operations.js";
import { buildFitActiveArtboardToSelectionJsx } from "../legacy/donor-backed/creold-compat.js";
import { directDonorJsx } from "./direct-donor.js";
import { executeToolJsx } from "./ie3jp/tools/tool-executor.js";
import { WRITE_ANNOTATIONS } from "./ie3jp/tools/modify/shared.js";

function registerFixedOperation(server: McpServer, name: string, title: string, description: string, inputSchema: Record<string, z.ZodType>, operation: Parameters<typeof buildBacklogOperationJsx>[0]["operation"], toRequest: (input: Record<string, unknown>) => Parameters<typeof buildBacklogOperationJsx>[0]) {
  server.registerTool(name, { title, description, inputSchema, annotations: WRITE_ANNOTATIONS }, async (input) =>
    executeToolJsx(directDonorJsx(title, buildBacklogOperationJsx(toRequest(input))), input, { activate: operation === "image_trace_selection", heavy: operation === "image_trace_selection" || operation === "rasterize_selection" }),
  );
}

/** Direct wrappers over fixed non-interactive Creold-compatible scripts. */
export function registerCreoldTools(server: McpServer): void {
  server.registerTool(
    "fit_artboard_to_selection",
    { title: "Fit Artboard to Selection", description: "Fit the active artboard to the current selection using the Creold-compatible implementation.", inputSchema: {}, annotations: WRITE_ANNOTATIONS },
    async () => executeToolJsx(directDonorJsx("Fit artboard", buildFitActiveArtboardToSelectionJsx()), {}),
  );
  registerFixedOperation(server, "image_trace_selection", "Image Trace", "Trace the first selected placed/raster image and expand the result.", {}, "image_trace_selection", () => ({ operation: "image_trace_selection" }));
  registerFixedOperation(server, "replace_formatted_text", "Replace Formatted Text", "Replace the contents of selected text frames while retaining their frame-level formatting.", { content: z.string() }, "replace_formatted_text", ({ content }) => ({ operation: "replace_formatted_text", content: String(content) }));
  registerFixedOperation(server, "duplicate_active_artboard", "Duplicate Active Artboard", "Create one offset copy of the active artboard with legacy-compatible Illustrator DOM behavior. For many data-driven copies from one template, prefer generate_template_variants instead of repeating this tool.", {}, "duplicate_artboard", () => ({ operation: "duplicate_artboard" }));
}
