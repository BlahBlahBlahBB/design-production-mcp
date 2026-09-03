import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LocalIllustratorBridge } from "../executor/local-illustrator-bridge.js";
import { ManagedSessionRegistry } from "../production/session/managed-sessions.js";

const color = z.union([
  z.object({ model: z.literal("RGB"), red: z.number().finite(), green: z.number().finite(), blue: z.number().finite() }),
  z.object({ model: z.literal("CMYK"), cyan: z.number().finite(), magenta: z.number().finite(), yellow: z.number().finite(), black: z.number().finite() }),
  z.object({ model: z.literal("GRAY"), gray: z.number().finite() }),
  z.object({ model: z.literal("NONE") }),
]);
const locator = z.object({ kind: z.literal("document-session-structural"), typename: z.string(), name: z.string().nullable(), layerPath: z.string(), ancestry: z.array(z.string()), collectionPath: z.string() });
const bounds = z.object({ left:z.number(), top:z.number(), right:z.number(), bottom:z.number(), width:z.number(), height:z.number() });
const expected = z.object({ typename:z.string().optional(), name:z.string().nullable().optional(), layerPath:z.string().optional(), contents:z.string().optional(), bounds:bounds.optional(), locked:z.boolean().optional(), hidden:z.boolean().optional() });
const style = { fill: color.optional(), stroke: color.optional(), strokeWidth: z.number().finite().nonnegative().optional() };

function response(value: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown>, isError };
}
function isFailure(value: unknown): boolean { return typeof value === "object" && value !== null && "ok" in value && (value as { ok?: unknown }).ok === false; }
function result(value: unknown) { return response(value, isFailure(value)); }

/** Official SDK MCP surface. No tool accepts arbitrary scripts, JSX, or shell input. */
export function createDesignProductionMcpServer(registry = new ManagedSessionRegistry(new LocalIllustratorBridge())): McpServer {
  const server = new McpServer({ name: "design-production-mcp", version: "0.0.1" });
  server.registerTool("illustrator_status", { description: "Detect the local Illustrator bridge and read its capabilities." }, async () => result(await registry.status()));
  server.registerTool("open_document", { description: "Open one explicit Illustrator document. Opening does not authorize writes.", inputSchema: { path: z.string().min(1) } }, async ({ path }) => result(await registry.openDocument(path)));
  server.registerTool("get_document_info", { description: "Read information from the active Illustrator document." }, async () => result(await registry.getDocumentInfo()));
  server.registerTool("find_objects", { description: "Find bounded structural object summaries. Supplying a managed session refreshes only that verified work copy.", inputSchema: { criteria: z.object({ name:z.object({value:z.string(),mode:z.enum(["exact","contains"])}).optional(), typename:z.union([z.string(),z.array(z.string())]).optional(), layerName:z.string().optional(), layerPath:z.string().optional(), text:z.object({value:z.string(),mode:z.enum(["exact","contains"])}).optional(), locked:z.boolean().optional(), hidden:z.boolean().optional() }), maxDepth:z.number().int().nonnegative().optional(), maxObjects:z.number().int().positive().optional(), maxResults:z.number().int().positive().optional(), sessionId:z.string().uuid().optional() } }, async ({ criteria, maxDepth, maxObjects, maxResults, sessionId }) => result(await registry.findObjects(criteria, { maxDepth, maxObjects, maxResults }, sessionId)));
  server.registerTool("create_work_copy", { description: "Create and authorize an opaque managed work-copy session from the active saved MASTER.", inputSchema: { masterPath:z.string().min(1), workPath:z.string().min(1) } }, async ({ masterPath, workPath }) => result(await registry.createWorkCopy(masterPath, workPath)));
  server.registerTool("reconcile_work_copy", { description: "Finalize a previously verified create_work_copy attempt after Illustrator finished opening the copied document. This performs read-only verification and never mutates a document.", inputSchema: z.object({ attemptId:z.string().uuid() }).strict() }, async ({ attemptId }) => result(await registry.reconcileWorkCopy(attemptId)));
  server.registerTool("save_document", { description: "Persist only the verified work copy represented by sessionId.", inputSchema: { sessionId:z.string().uuid() } }, async ({ sessionId }) => result(await registry.saveDocument(sessionId)));
  server.registerTool("create_rectangle", { description:"Create a rectangle in artboard top-left, X-right/Y-down coordinates.", inputSchema:{ sessionId:z.string().uuid(), artboardIndex:z.number().int().nonnegative().optional(), x:z.number().finite(),y:z.number().finite(),width:z.number().positive(),height:z.number().positive(),name:z.string().optional(),...style } }, async ({sessionId,...request})=>result(await registry.createRectangle(sessionId,request)));
  server.registerTool("create_ellipse", { description:"Create an ellipse in artboard top-left, X-right/Y-down coordinates.", inputSchema:{ sessionId:z.string().uuid(), artboardIndex:z.number().int().nonnegative().optional(), x:z.number().finite(),y:z.number().finite(),width:z.number().positive(),height:z.number().positive(),name:z.string().optional(),...style } }, async ({sessionId,...request})=>result(await registry.createEllipse(sessionId,request)));
  server.registerTool("create_line", { description:"Create an unfilled line in artboard top-left, X-right/Y-down coordinates.", inputSchema:{ sessionId:z.string().uuid(), artboardIndex:z.number().int().nonnegative().optional(), x1:z.number().finite(),y1:z.number().finite(),x2:z.number().finite(),y2:z.number().finite(),name:z.string().optional(),stroke:color.optional(),strokeWidth:z.number().finite().nonnegative().optional() } }, async ({sessionId,...request})=>result(await registry.createLine(sessionId,request)));
  server.registerTool("create_text_frame", { description:"Create a basic point text frame in artboard coordinates.", inputSchema:{ sessionId:z.string().uuid(), artboardIndex:z.number().int().nonnegative().optional(),x:z.number().finite(),y:z.number().finite(),contents:z.string(),name:z.string().optional(),fontPostScriptName:z.string().optional(),fontSize:z.number().finite().positive().optional(),...style } }, async ({sessionId,...request})=>result(await registry.createTextFrame(sessionId,request)));
  server.registerTool("update_object", { description:"Update a verified PathItem via a current structural locator and expected state.", inputSchema:{ sessionId:z.string().uuid(),locator,expected,artboardIndex:z.number().int().nonnegative().optional(),x:z.number().finite().optional(),y:z.number().finite().optional(),width:z.number().positive().optional(),height:z.number().positive().optional(),name:z.string().optional() } }, async ({sessionId,...request})=>result(await registry.updateObject(sessionId,request)));
  server.registerTool("set_fill_stroke", { description:"Set supported process fill/stroke colors on a verified locator.", inputSchema:{ sessionId:z.string().uuid(),locator,expected,...style } }, async ({sessionId,...request})=>result(await registry.setFillStroke(sessionId,request)));
  return server;
}
