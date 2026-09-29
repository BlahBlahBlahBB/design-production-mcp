import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildBacklogOperationJsx } from "../legacy/donor-backed/backlog-operations.js";
import { buildFitActiveArtboardToSelectionJsx } from "../legacy/donor-backed/creold-compat.js";
import { directDonorJsx } from "./direct-donor.js";
import { executeToolJsx } from "./ie3jp/tools/tool-executor.js";
import { WRITE_ANNOTATIONS } from "./ie3jp/tools/modify/shared.js";
import { createSmartTextAutoFlowIllustratorAdapter, selectedTextFrameUuids, SMART_TEXT_OPERATION_TIMEOUT_MS } from "./smart-text-auto-flow/illustrator-adapter.js";
import { formattedMutationSucceeded, mutationsForFormattedReplacement } from "./smart-text-auto-flow/mutation-descriptors.js";
import { executeSmartTextMutation } from "./smart-text-auto-flow/transaction.js";
import { formatToolResult } from "./ie3jp/tools/tool-executor.js";

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
  server.registerTool(
    "replace_formatted_text",
    { title: "Replace Formatted Text", description: "Replace the contents of selected text frames while retaining their frame-level formatting.", inputSchema: { content: z.string() }, annotations: WRITE_ANNOTATIONS },
    async (input) => {
      const targetUuids = await selectedTextFrameUuids();
      const executeMutation = () => executeToolJsx(
        directDonorJsx("Replace Formatted Text", buildBacklogOperationJsx({ operation: "replace_formatted_text", content: String(input.content) })),
        input,
        { timeoutMs: SMART_TEXT_OPERATION_TIMEOUT_MS },
      );
      if (!targetUuids.length) return executeMutation();
      return (await executeSmartTextMutation({
        mutations: mutationsForFormattedReplacement(targetUuids),
        executeMutation,
        mutationSucceeded: formattedMutationSucceeded,
        failure: (reason, status) => formatToolResult({ success: false, error: true, message: `replace_formatted_text smart auto flow ${status}: ${reason}` }),
        adapter: createSmartTextAutoFlowIllustratorAdapter(),
      })).result;
    },
  );
  registerFixedOperation(server, "duplicate_active_artboard", "Duplicate Active Artboard", "Create one offset copy of the active artboard with legacy-compatible Illustrator DOM behavior. For many data-driven copies from one template, prefer generate_template_variants instead of repeating this tool.", {}, "duplicate_artboard", () => ({ operation: "duplicate_artboard" }));
}
