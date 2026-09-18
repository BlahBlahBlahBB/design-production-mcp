import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ManagedSessionRegistry } from "../production/session/managed-sessions.js";

function response(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
    isError,
  };
}

function result(value: unknown) {
  return response(value, typeof value === "object" && value !== null && "ok" in value && (value as { ok?: unknown }).ok === false);
}

/** Registers only DPM workflows that require MASTER/work-copy protection. */
export function registerDpmProductionTools(server: McpServer, production: ManagedSessionRegistry): void {
  // Diagnostic-only Core utility. It is deliberately not part of the three-tool
  // Production surface and its description keeps agents from ritual probing.
  server.registerTool(
    "illustrator_status",
    { description: "Diagnostic only: read local Illustrator bridge status. Do not call before ordinary document work; a successful Core tool call already proves the connection." },
    async () => result(await production.status()),
  );
  server.registerTool(
    "create_work_copy",
    {
      description: "DPM Production only. Use ONLY when the user explicitly asks to protect a MASTER, preserve the original, or work on a copy. Never infer this from a filename, document content, size, or perceived importance.",
      inputSchema: { masterPath: z.string().min(1), workPath: z.string().min(1) },
    },
    async ({ masterPath, workPath }) => result(await production.createWorkCopy(masterPath, workPath)),
  );
  server.registerTool(
    "reconcile_work_copy",
    {
      description: "DPM Production only. Use ONLY to reconcile a work-copy session that was explicitly created after the user requested MASTER protection or a work-copy workflow.",
      inputSchema: { attemptId: z.string().uuid() },
    },
    async ({ attemptId }) => result(await production.reconcileWorkCopy(attemptId)),
  );
  server.registerTool(
    "dpm_save_work_copy",
    {
      description: "DPM Production only. Save an explicitly requested, server-authorized work copy. It cannot save a MASTER; never use this for an ordinary Core edit.",
      inputSchema: { sessionId: z.string().uuid() },
    },
    async ({ sessionId }) => result(await production.saveDocument(sessionId)),
  );
}
