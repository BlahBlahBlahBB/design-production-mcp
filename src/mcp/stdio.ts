import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { cleanupTmpDirSync, ensureTmpDir } from "../illustrator/core/ie3jp/executor/file-transport.js";
import { waitForPendingExecutions } from "../illustrator/core/ie3jp/executor/jsx-runner.js";
import { createDesignProductionMcpServer } from "./server.js";

await ensureTmpDir();
process.on("exit", cleanupTmpDirSync);
process.on("SIGINT", () => { void waitForPendingExecutions().finally(() => process.exit(0)); });
process.on("SIGTERM", () => { void waitForPendingExecutions().finally(() => process.exit(0)); });
const server = createDesignProductionMcpServer();
await server.connect(new StdioServerTransport());
