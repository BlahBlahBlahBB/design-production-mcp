# Implementation map

```
Codex / another HTTP MCP client
        |
        | POST http://127.0.0.1:18412/v1/mcp
        | Authorization: Bearer <REDACTED>
        v
AIAgenticSystem.aip (native arm64 Illustrator plug-in)
  - MCPHTTPTransport listens on localhost
  - validates bearer authentication
  - handles initialize and MCP dispatch
  - registers/uses AI MCP Server Suite
        |
        v
MCPToolkit.aip (native arm64 Illustrator plug-in)
  - owns the embedded module/tool schema registry
  - validates and dispatches named tools
  - executes against Illustrator suites and document state
        |
        v
Adobe Illustrator main process + private host suites/frameworks
```

## Tool declarations

The actual implementation-side tool declarations were located in the `MCPToolkit` Mach-O string table, not as source files. The registry begins around `strings(1)` line 2458 with a draft-07-labelled schema and has 28 named modules. Its declared `toolCount` values total **90**.

The raw extracted declaration span is preserved at `unpacked/MCPToolkit.embedded-tool-registry.raw.txt` so the actual embedded names, descriptions, schemas, and access-gate fields can be searched without rescanning the installed application.

The declaration style is data-driven but compiled into native code: each tool record includes `name`, `description`, `inputSchema`, `outputSchema`, `internalAccess`, and `externalAccess`. The native code also exposes `ExecuteTool`, `MCP_Tool_`, and `AI MCP Toolkit Suite` diagnostics. Therefore the registration is not declarative JSON/JS distributed as an independent file; it is readable registry data embedded in the native plug-in and consumed by native code.

The public server component is likewise native: `AIAgenticSystem` includes `MCPServer.cpp` path evidence, `MCPHTTPTransport`, localhost-binding, authentication, request routing, and execution diagnostics. Its strings reference `GetDomainTools` and `ExecuteTool`; no separate plain `tools/list` handler source was found.

## Dependencies and launch context

Both plug-ins dynamically link Adobe host frameworks including `aifm`, `SPBasic`, `MacMemory`, and `uxtech`, resolving via `@executable_path/../Frameworks/...` inside the Illustrator application bundle. Their execution also relies on the Illustrator plug-in lifecycle and private suites such as `AI MCP Server Suite` and `AI MCP Toolkit Suite`. They are not a Node/UXP process and are not a standalone package.

Static evidence therefore supports copying the signed plug-in bundles only as research artifacts. It does not support launching them independently or adapting their operational implementation outside Illustrator Beta.
