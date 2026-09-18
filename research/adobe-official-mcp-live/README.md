# Adobe Illustrator 官方 MCP 动态研究工具

这个目录只用于研究 **本机正在运行的 Adobe Illustrator Beta 官方 MCP**。

它不属于 Design Production Illustrator MCP 的正式运行时，也不会改变 Core / DPM Production 工具。

## 能采集什么

研究代理会记录：

- MCP 初始化与 `tools/list`
- Codex 实际调用的官方工具名
- 每次调用的参数**结构**与数组长度
- HTTP / MCP 调用耗时
- 成功 / 失败次数
- 官方工具 Schema

默认不会把 Authorization / Bearer token 写进日志；工具调用参数只记录结构，不记录实际字符串、颜色值、文字内容或文件路径。

输出目录：

```text
research/adobe-official-mcp-live/output/
  official-server-info.json
  official-tools.json
  official-call-trace.jsonl
  official-performance-summary.json
```

`output/` 已被 Git 忽略，不会提交到公开仓库。

## 推荐用法：透明代理

先保持 Illustrator Beta 的官方 MCP 已经正常连接 Codex。

在项目目录运行：

```bash
npm run research:adobe-mcp
```

它会启动：

```text
Codex
  ↓
http://127.0.0.1:18413/v1/mcp
  ↓
http://localhost:18412/v1/mcp
  ↓
Adobe Illustrator Beta
```

然后在 Codex 的 Adobe Illustrator 官方 MCP 配置里，临时把 URL 从：

```text
http://localhost:18412/v1/mcp
```

改成：

```text
http://127.0.0.1:18413/v1/mcp
```

Authorization Header 保持原样。

完全重启 Codex 后，正常使用官方 MCP 完成测试任务。测试结束回终端按 `Ctrl+C`。

最后把 Codex 的官方 MCP URL 改回：

```text
http://localhost:18412/v1/mcp
```

## 可选：直接导出工具清单

如果只想导出官方工具 Schema：

```bash
export ADOBE_ILLUSTRATOR_MCP_BEARER_TOKEN='你的 Illustrator Beta MCP key'
npm run research:adobe-mcp:dump
unset ADOBE_ILLUSTRATOR_MCP_BEARER_TOKEN
```

不要把 key 提交、截图或发送给别人。

## 建议对照任务

使用同一份可丢弃的 Illustrator 测试文件，对官方 MCP 和 Design Production Illustrator MCP 分别执行：

```text
把当前文件中的所有可编辑文字改成纯红色 RGB 255, 0, 0。
不要转轮廓。
完成后验证所有文字的实际颜色。
```

重点比较：

- 总耗时
- MCP 工具调用次数
- 是否一次处理多个对象
- 是否抢占 Illustrator 前台
- 修改后验证方式
- 失败后的处理方式
