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
  server.registerTool(
    "illustrator_status",
    { description: "Read the local Illustrator bridge status without changing the current document." },
    async () => result(await production.status()),
  );
  server.registerTool(
    "create_work_copy",
    {
      description: "DPM Production: create and authorize a protected work-copy session from a saved MASTER.",
      inputSchema: { masterPath: z.string().min(1), workPath: z.string().min(1) },
    },
    async ({ masterPath, workPath }) => result(await production.createWorkCopy(masterPath, workPath)),
  );
  server.registerTool(
    "reconcile_work_copy",
    {
      description: "DPM Production: complete a pending protected work-copy authorization by read-only reconciliation.",
      inputSchema: { attemptId: z.string().uuid() },
    },
    async ({ attemptId }) => result(await production.reconcileWorkCopy(attemptId)),
  );
  server.registerTool(
    "dpm_save_work_copy",
    {
      description: "DPM Production: save only a server-authorized work copy. It cannot save a MASTER.",
      inputSchema: { sessionId: z.string().uuid() },
    },
    async ({ sessionId }) => result(await production.saveDocument(sessionId)),
  );
}
