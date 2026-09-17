# 开源来源说明

本文档记录公开 Illustrator MCP Runtime 中实际使用的开源代码来源、审查版本、许可证，以及整合时做过的有限本地适配。

| 来源项目 | 已审查版本 | 许可证 | 对 Runtime 的贡献 | 本地适配 |
|---|---|---|---|---|
| [IE3JP illustrator-mcp-server](https://github.com/ie3jp/illustrator-mcp-server) | `1814485cfa24787215f0ec515a6853cb293e1e0a` | MIT | 67 个 Core Registry 工具、JSX Helpers、文件传输、图片 Header 工具 | 默认目标改为 Stable 2026；使用本地串行 Promise 队列；构建时复制 JSX Helper；DPM Production 单独注册。 |
| [Alexander Ladygin illustrator-scripts](https://github.com/Alexander-Ladygin/illustrator-scripts) | `fc7625410b62c833fce100f67cf18a97588279c5` | MIT | `expand_objects` 与 `pathfinder_objects` 所使用的固定 Illustrator Action 载荷 | 加入类型化的“当前选区”封装；不开放任意 Action Payload，也不包含 donor UI。 |
| [Creold illustrator-scripts](https://github.com/creold/illustrator-scripts) | `9b3e3eeade9ba748f41612ec4697bb6a5c2489c2` | MIT | 画板适配、Image Trace、格式化文字替换、复制活动画板等固定 DOM 操作 | 使用类型化当前文档封装；移除 donor 对话框和脚本运行外壳。 |

其余 DPM Production 实现属于本项目自有代码。

DPM 的 Work Copy / MASTER 安全机制刻意与普通 Core 命令分离：

- Core：直接作用于当前 Illustrator 文档
- DPM Production：保护受控的 MASTER / Work Copy 生产流程

## 未包含的项目

`jinkeda/Illustrator_MCP` 曾作为架构和能力研究对象，但当时无法从仓库根目录明确验证其许可证，因此目前 **没有复制该项目源码**。

完整的第三方版权与许可证声明见：

[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
