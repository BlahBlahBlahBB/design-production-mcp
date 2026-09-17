# Static inventory

## Application

- Path: `/Applications/Adobe Illustrator (Beta)/Adobe Illustrator.app`
- Bundle ID: `com.adobe.illustratorBeta`
- Version: `30.9.0` (Adobe Product Build `66`)
- Executable: `Contents/MacOS/Adobe Illustrator` (`arm64`)
- Bundle inventory: 22,510 regular files; approximately 3.1 GB.

## MCP-relevant components

| Component | Source path | Type | Static MCP evidence |
| --- | --- | --- | --- |
| AIAgenticSystem | `Contents/Required/Plug-ins/Extensions/AIAgenticSystem.aip` | Native arm64 `.aip` bundle | `/v1/mcp`, `initialize`, `tools/call`, `MCPHTTPTransport`, `MCPServer`, localhost listener, Bearer authentication, MCP server state notifiers. |
| MCPToolkit | `Contents/Required/Plug-ins/Extensions/MCPToolkit.aip` | Native arm64 `.aip` bundle | `inputSchema`, `outputSchema`, module/tool registry, `ExecuteTool`, `MCP_Tool_`, Illustrator tool-execution diagnostics. |

Neither identified bundle contains JavaScript, TypeScript, `package.json`, Node modules, ASAR, UXP archive, CEP archive, WASM, or a standalone server executable. Their ancillary files are signed-resource metadata, plist metadata, localization strings, PiPL/resource-fork data, and the native plug-in binary.

## Content-search findings

- Exact `/v1/mcp` content hit: `AIAgenticSystem.aip/Contents/MacOS/AIAgenticSystem`.
- Exact `inputSchema` content hit: `MCPToolkit.aip/Contents/MacOS/MCPToolkit` (also appears in `AIAgenticSystem` as server-side protocol/schema handling).
- `AIAgenticSystem` contains the source path `PlugInDev/AIAgenticSystem/Source/MCPHosting/MCPServer.cpp` and the literal response `Unauthorized: invalid or missing bearer token`.
- `MCPToolkit` contains source-path strings under `PlugInDev/MCPToolkit/Source/`, an embedded `draft-07`-labelled schema registry, `ExecuteTool`, `MCP_Tool_`, and `AI MCP Toolkit Suite`.

## Copies

The two `.aip` bundles were copied with metadata preserved into `copied-files/Required/Plug-ins/Extensions/`. The copy contains 64 files and is approximately 9.0 MB. No archive was unpacked.

`unpacked/MCPToolkit.embedded-tool-registry.raw.txt` is a lossless text extraction of the registry-bearing string-table span (291,658 bytes, SHA-256 `59434d3f36149e7ab762523682c5d1984b3c6957863940e453d65819d0c04c6f`). It is deliberately labelled raw text: it is embedded binary string-table output, not a valid standalone JSON file and not a live protocol response.
