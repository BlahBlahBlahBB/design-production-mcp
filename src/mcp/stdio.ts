import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDesignProductionMcpServer } from "./server.js";

const server = createDesignProductionMcpServer();
await server.connect(new StdioServerTransport());
