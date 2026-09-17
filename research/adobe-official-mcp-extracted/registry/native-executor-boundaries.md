# Native executor boundaries

## Recovered boundary chain

1. **Registry** — `MCPToolkit` embeds 28 module records and 90 tool records. Each record carries a `name`, `description`, `inputSchema`, `outputSchema`, `internalAccess`, and `externalAccess` field. The full raw span is preserved in `../unpacked/MCPToolkit.embedded-tool-registry.raw.txt`.
2. **MCP server / registry query** — `AIAgenticSystem` contains `MCPServer::GetDomainTools`, `MCPServer::ExecuteTool`, `GetDomainTools`, `Unknown tool in incremental mode`, and `AI MCP Toolkit Suite` strings. This is strong evidence that the host queries tool definitions by domain/module and sends tool calls through an MCP server layer.
3. **Executor** — `AIAgenticSystem` contains `IllustratorToolExecutor::ExecuteTool`, `IllustratorToolExecutor::ExecuteToolAsync`, `PostNonUITaskOnMainThread`, and `MCPToolkit::Background::`. The strings explicitly describe main-thread and background-thread dispatch.
4. **Native operation dispatcher** — `MCPToolkit` contains `ExecuteTool`, `Unknown tool`, `MCP_Tool_`, `MCP Tool Executing`, `MCP Tool Executed`, `AI MCP Toolkit Suite`, and per-operation source path strings such as `Source/PathfinderTasks/PathfinderTasks.cpp`.
5. **Illustrator host boundary** — `MCPToolkit` contains literal Adobe suite names, including `AI Art Suite`, `AI Document Suite`, `AI Layer Suite`, `AI Path Suite`, `AI Placed Suite`, `AI Matching Art Suite`, `AI Rasterize Suite`, and `AI Export PNG Suite`.

## Strongest conclusion

The static evidence supports **tool name → MCPServer / IllustratorToolExecutor → MCPToolkit native ExecuteTool → Illustrator suites**. The registry has a module-to-tool grouping, but no separately recoverable static table proving a distinct `tool name → handler symbol` or `tool name → menu command identifier` mapping for every tool. Those per-tool mappings are therefore `UNKNOWN`, not inferred.

## Provenance

- `AIAgenticSystem` offsets `0x3f5e31`, `0x3f7888`–`0x3f859c`, and `0x402d93`–`0x403b9c`, all in `__TEXT,__cstring`.
- `MCPToolkit` offsets `0x2e5cc4` and `0x2e65e3`–`0x2e683e`, in `__TEXT,__cstring`.
- Offset-bearing raw evidence is retained under `evidence/`; no extracted code was executed.
