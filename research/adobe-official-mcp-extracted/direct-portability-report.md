# Direct-portability report

## Classification: D — NATIVE

The official localhost MCP server is implemented primarily in compiled arm64 Mach-O Illustrator plug-ins:

- `AIAgenticSystem.aip` provides the HTTP MCP transport, localhost listener, bearer authentication, initialization/session handling, and dispatch.
- `MCPToolkit.aip` provides the tool registry and execution logic against Illustrator's private plug-in suites.

The presence of a human-readable embedded tool registry does not make the implementation directly portable: the registry is compiled into `MCPToolkit`, and both the server and tool executor require the Illustrator application process, private suites, and bundled Adobe frameworks.

## Directly reusable

- Exact copied binary artifacts for archival/static research only.
- Tool names, descriptions, input schemas, output-schema placeholders, and access-gate metadata recoverable from the embedded registry.
- Static protocol evidence: endpoint path, localhost-only listener, Bearer authentication requirement, and server/tool component split.

## Not directly reusable

- The HTTP server implementation, authentication/session implementation, request dispatcher, and operation executor: compiled native code.
- Every Illustrator operation behind the tool declarations: it invokes private Illustrator suites/host state rather than a portable public scripting runtime.
- The plug-ins as independently launchable components: static `@executable_path` framework dependencies, native plug-in packaging, and suite/lifecycle evidence tie them to the Illustrator main process.

## Explicit answers

1. **Physical MCP implementation:** `Contents/Required/Plug-ins/Extensions/AIAgenticSystem.aip` (server) and `MCPToolkit.aip` (registry/executor) in Illustrator Beta.
2. **Port 18412 owner:** the Illustrator main executable, PID 25551; not a helper, Node, or UXP process.
3. **Readable official tool files:** no standalone readable JS/JSON tool-definition files. Readable declarations exist only as embedded strings in a native binary.
4. **Can they be copied directly?** yes, as unchanged native plug-in bundles; no, as independently usable MCP source.
5. **Standalone MCP server package:** no static evidence of one.
6. **Independent launch:** not tested. Static dependencies indicate it requires Illustrator Beta's plug-in host and private frameworks.
7. **Adobe-specific runtime/frameworks:** Illustrator private suites plus `aifm`, `SPBasic`, `MacMemory`, and `uxtech` frameworks.
8. **API boundary:** native private host interfaces, not public Illustrator scripting APIs.
9. **Literal reusable portions:** copied binaries and extracted schema text/metadata only.
10. **Blocked portions:** native server, tool dispatcher, and host-operation logic tied to Illustrator Beta.

## Protocol limitation

The requested non-mutating `initialize` / `tools/list` dump could not be authenticated from this task: the configured bearer-token variable was unavailable and the official MCP namespace was not attached to the task. `protocol/tools-list.raw.json` records this limitation without storing authentication material. The embedded registry declares 90 tools, but that is not evidence that all 90 are exposed by a live `tools/list` call; the actual live exposed count is therefore undetermined.
