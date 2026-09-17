# 第三方开源声明

本项目由独立维护者维护，并以 MIT License 发布。

下面列出的第三方代码被直接包含在公开 Runtime 中，或作为重要基础被适配使用。对应项目原有的版权声明和许可证仍然有效。

## IE3JP — `ie3jp/illustrator-mcp-server`

- 上游项目：<https://github.com/ie3jp/illustrator-mcp-server>
- 已审查版本：`1814485cfa24787215f0ec515a6853cb293e1e0a`
- 许可证：MIT
- 版权：Copyright (c) 2026 cyocun (IE3)
- 本项目包含位置：`src/illustrator/core/ie3jp/`

IE3JP 的 Core Registry、Tool Modules、文件传输、JSX Helpers 和图片 Header 工具被大体按原实现保留。

上游 MIT License 文本保存在：

`src/illustrator/core/ie3jp/LICENSE`

本地只进行了有限集成调整，包括：

- 默认目标设为 Adobe Illustrator 2026 Stable
- 将上游 `p-limit` 依赖替换为本地串行 Promise 队列
- 构建时复制 JSX Helpers
- DPM Production 工具单独注册

IE3JP Core 仍然直接操作当前活动 Illustrator 文档。

## Alexander Ladygin — `Alexander-Ladygin/illustrator-scripts`

- 上游项目：<https://github.com/Alexander-Ladygin/illustrator-scripts>
- 已审查版本：`fc7625410b62c833fce100f67cf18a97588279c5`
- 许可证：MIT
- 版权：Copyright (c) 2018 Alexander Ladygin

项目从 `libraries/AI_PS_Library.js` 的成熟 Action 实现中适配了固定 Action Payload，用于：

- `expand_objects`
- `pathfinder_objects`

DPM 只提供固定、类型化的当前选区调用接口，不暴露任意 Action Payload。

## Creold / Sergey Osokin — `creold/illustrator-scripts`

- 上游项目：<https://github.com/creold/illustrator-scripts>
- 已审查版本：`9b3e3eeade9ba748f41612ec4697bb6a5c2489c2`
- 许可证：MIT
- 版权：Copyright (c) 2025 Sergey Osokin

本项目适配了其成熟的非交互 Illustrator DOM 行为，用于：

- 画板适配到选区
- Image Trace
- 格式化文字替换
- 复制活动画板

没有包含 donor 的交互对话框，也没有开放任意脚本执行入口。

## SheetJS Community Edition — `xlsx`

- 官方分发地址：<https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz>
- 固定版本：`0.20.3`
- 许可证：Apache-2.0
- 版权：Copyright (C) 2012-present SheetJS LLC

DPM Production 的输入解析基础设施使用官方 SheetJS Community Edition 包读取 Excel 第一工作表。

## 未包含：Jinkeda

`jinkeda/Illustrator_MCP` 只作为架构 / 能力研究对象进行过审查。

当时无法从仓库根目录明确验证其许可证，因此本项目 **没有复制该仓库的源码**。

## 第三方代码引入原则

后续新增第三方代码前，应记录：

- 上游仓库
- 精确版本 / Commit
- License
- 实际引入的代码范围
- 本地做过的修改

同时更新本文档和：

[docs/open-source-origins.md](docs/open-source-origins.md)
