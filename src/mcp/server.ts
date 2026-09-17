import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LocalIllustratorBridge } from "../executor/local-illustrator-bridge.js";
import { registerAlexanderTools } from "../illustrator/core/alexander-tools.js";
import { registerCreoldTools } from "../illustrator/core/creold-tools.js";
import { registerAllTools as registerIe3jpCoreTools } from "../illustrator/core/ie3jp/tools/registry.js";
import { registerDpmProductionTools } from "./dpm-production-tools.js";
import { ManagedSessionRegistry } from "../production/session/managed-sessions.js";

/**
 * The normal Illustrator surface is IE3JP's direct current-document MCP.
 * DPM's work-copy policy is registered separately and applies only to
 * production workflows.
 */
export function createDesignProductionMcpServer(
  production = new ManagedSessionRegistry(new LocalIllustratorBridge()),
): McpServer {
  const server = new McpServer({ name: "design-production-mcp", version: "0.0.1" });
  registerIe3jpCoreTools(server);
  registerAlexanderTools(server);
  registerCreoldTools(server);
  registerDpmProductionTools(server, production);
  return server;
}
