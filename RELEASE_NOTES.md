# v0.4.2 发布说明

## Hard routing for Illustrator MCP

- 修复自然语言 Illustrator 任务偶发先走 Computer Use / UI reconnaissance 的问题。
- 当用户指向当前/已打开的 Illustrator / AI 文档，且任务已由 DPM MCP 支持时，第一个后端动作必须优先调用 `design-production-illustrator` MCP。
- 明确禁止把“查看当前文件 / 看画布 / 看选区 / 打开菜单 / 检查面板”作为 MCP 可完成任务的前置步骤。
- 全文档字体、段落对齐、文字颜色等任务直接使用 `set_typography(all_stories=true)`，不先全选、不先菜单导航、不先发现 TextFrame UUID。
- `set_typography` 工具描述同步强化同一条 Story-first 路由语义。
- 增加 routing regression，锁定上述行为。
- 真实自然语言 QA 已验证：首个 backend action 直接为 Design Production Illustrator / Set Typography，未再使用 Computer Use。

### Validation

- `npm test`: **117 / 117 PASS**
- TypeScript build: **PASS**
- `git diff --check`: **PASS**
- Natural-language routing QA: **PASS**
- Computer Use precursor: **not used**

---

# v0.4.1 发布说明

## Story-wide typography stabilization

- 新增并稳定全文档 Story 模式：`set_typography(all_stories=true)` 与 `get_typography_metrics(all_stories=true)` 直接通过 `doc.stories` / `Story.textRange` 工作，不再为了全文档 Typography 依赖 `doc.textFrames` wrapper 或 PageItem UUID 发现。
- 保留原有显式 `uuids[]` / TextFrame 路径；两种 target mode 互斥，单对象能力没有被替换。
- 修复 Illustrator 2026 Stable 30.8.1 中可复现的 TextFrame wrapper `Object is invalid` 问题：Story 文本本身可读写时，不再绕回失效的 TextFrame collection。
- `get_typography_metrics` 对局部 Character / Paragraph wrapper 读取异常支持 partial degradation，并返回对应 failure metadata，而不是拖垮整个 Story。
- 修复 Story 没有直接字符串 `contents` 时的读取：显式 fallback 到 `Story.textRange.contents`，避免 `undefined 不是对象`。
- Codex routing 现在把“当前 AI 文件 / 打开的 Illustrator 文件”等普通自然语言全文档文字请求优先路由到 Story Typography；CSS `#RRGGBB` 颜色会先规范化为 MCP RGB color object。
- 最终验证：`npm test` 117 / 117 PASS、TypeScript build PASS、`git diff --check` PASS；真实 Illustrator 写入 QA PASS；最终 `get_typography_metrics(all_stories=true)` 只读 QA PASS，正常返回 Story、Han / Latin script runs 与 paragraph alignment。

---

# v0.4.0 发布说明

## Mixed-script typography + Illustrator 2022–2026 compatibility

- 扩展现有 `set_typography`：新增批量 `script_rules.han` / `script_rules.latin`，可在同一个 TextFrame 内为中文与英文分别设置字体、字重及其它安全 Character formatting；仍保持一次 MCP 调用、一次后台 JSX 执行。
- `get_typography_metrics` 新增紧凑 `script_runs` 读回，用于验证 Han / Latin 实际字体与字重；不破坏已有 official-compatible typography fields、`font_runs` 与 `mixed_fields`。
- 默认脚本规则固定：CJK / 全角标点跟随 Han；ASCII 数字与标点跟随 Latin；空格、Tab、CR/LF 以及未识别字符保持原格式，不由 script rules 主动修改。
- 缺失字体不会静默替换：按 rule/property 明确返回 `FONT_NOT_FOUND` / 依赖状态。
- 增加 Illustrator 2022–2026 兼容策略与 `compatibility-check.command` / `npm run compatibility:check`。2026 Stable 30.8.1 为 maintainer verified；2022–2025 为 `SUPPORTED_UNVERIFIED`，不虚假宣称已实机验证。
- 2026 Stable 30.8.1 compatibility smoke：16 PASS、0 FAIL、1 SKIPPED（无外部图片 fixture）；50 个 TextFrame 混合脚本字体、段落左对齐、跨调用 UUID 与 +200pt 移动均完成真实读回。
- 保留 v0.3.1 native Illustrator UUID 主路径与 legacy note UUID fallback，不重新设计对象身份层。

---

# v0.3.1 发布说明

## Native Illustrator UUID identity

- Core 现优先使用 Illustrator 24+ 的 `PageItem.uuid` 和
  `Document.getPageItemFromUuid()`，从而在独立 JSX / MCP 执行之间保持对象身份。
- 旧 DPM `PageItem.note` UUID 仅作为兼容回退保留。无法读到 native UUID 且 note
  写入无法读回确认时会明确失败，不会返回无法再次定位的临时 UUID。
- 所有 Core 继续复用同一 shared UUID helper；duplicate 操作也不再另行生成未验证 UUID。

---

# v0.3.0 发布说明

## Comprehensive Illustrator typography control

- 新增两个（且仅两个）批量 Typography Core 工具：`get_typography_metrics` 和 `set_typography`。两者均为一次 MCP 调用、一次后台 JSX 执行、`uuids[]` 批量处理。
- `get_typography_metrics` 对齐本地捕获的 official `GetTypographyMetrics` 读取语义：文字长度/内容/溢出、全量字体条目、字体/字距/行距/基线/缩放与段落对齐；混合格式明确返回 `mixed_fields`，不伪造首字符值。
- `set_typography` 只写调用方显式提供的 CharacterAttributes / ParagraphAttributes，并逐属性返回 DOM readback。OpenType 与字体失败返回 `FONT_DEPENDENT`；Classic DOM 未暴露能力返回 `NOT_EXPOSED_BY_CLASSIC_DOM`。
- 修正旧 `get_text_frame_detail`：character `leading` / `autoLeading` 不再错误地从 ParagraphAttributes 读取；paragraph 读取改为 `autoLeadingAmount` / `leadingType`。
- `align_objects` 现在明确标注为画布空间对齐，不可用于段落/文字两端对齐；文字命名样式继续由 `apply_text_style` 处理。
- 完整能力、来源、限制和真机 QA 状态见 `docs/typography-capability-matrix.md`。

---

# v0.2.0 发布说明

## Official-style Core orchestration

- Core 默认直接操作当前 Illustrator 文档；DPM Production 仅在用户明确要求保护 MASTER / Work Copy 时启用。普通任务不会自动 Work Copy 或保存。
- 重写 Codex routing：最少必要调用、复用当前回合 UUID、禁止 status/version/document ritual、禁止 Beta/Official MCP/Computer Use 静默回退、禁止自动 Undo。
- `find_objects` 现在支持 `object_types[]`、按文字/外观/字体等条件批量查询，以及同次 JSX 的 `set_properties`（fill、stroke、stroke_width）；TextFrame 写入走 character attributes。
- `set_appearance`、`get_visual_appearance` 进一步明确批量与一次验证语义；新增 `move_objects`、`rotate_objects`、`scale_objects`、`rename_objects` 的 batch-first Core API。
- 研究了实时捕获的 47-tool official schema 与 50-text live trace；比较与 canonical Core 调用模式见 `research/adobe-official-mcp-live/v0.2.0-core-comparison.md`。

---

# v0.1.1 发布说明

## Illustrator Core 批量后台写入

- 新增 `set_appearance`、`get_visual_appearance`、`modify_objects`；Core 现有 **77** 个公开工具。
- `modify_object` 继续兼容单对象调用，但复用批量修改核心，且不再激活 Illustrator。
- 普通 DOM Core 操作及 heavy 操作默认后台运行；只有固定 Action / 菜单路径（Expand、Pathfinder、Image Trace）显式激活 Illustrator。
- TextFrame 外观写入和验证均以真实 character attributes 为准，批量读取会报告 mixed fill/stroke。
- 安装器写入 batch-first、无 Beta/官方 MCP/Computer Use 自动回退、无自动 Undo 的路由规则。

---

# v0.1.0 发布说明

这是 Design Production MCP 的首个公开版本。

## 这一版包含什么

### Illustrator Core：74 个公开工具

来源组成：

- 67 个 IE3JP Core 工具
- 2 个 Alexander Ladygin 工具
- 4 个 Creold / Sergey Osokin 工具
- 1 个 DPM `illustrator_status` 工具

主要能力覆盖：

- 文档读取、创建、打开、关闭、保存
- 基础图形与路径
- 文字创建、读取、样式、轮廓化
- 对象查找、选择、复制、删除、群组、解组、对齐
- 图层与画板
- 颜色、Swatches、Gradient、Graphic Style
- 图片 Place / Relink / Embed
- SVG 导入
- Image Trace
- Pathfinder
- Object > Expand
- Symbols / Datasets
- Export / PDF
- Preflight / Overprint / Separation / Crop Marks
- Design Tokens / Style Guide 等辅助能力

### DPM Production：3 个公开工具

- `create_work_copy`
- `reconcile_work_copy`
- `dpm_save_work_copy`

用于需要保护 MASTER 文件的受控生产流程。

## 安装

```bash
git clone https://github.com/BlahBlahBlahBB/design-production-mcp.git
cd design-production-mcp
./install.command
```

安装完成后重启 Codex，然后打开 Adobe Illustrator 2026 Stable，调用：

```text
illustrator_status
```

即可检查连接状态。

## 已验证环境

- macOS
- Node.js 20+
- Adobe Illustrator 2026 Stable 30.8.1
- Codex 本地 stdio MCP

Adobe Illustrator Beta 不需要。

Illustrator 26.1 和 Windows 当前仍属于未正式认证环境。

## 验证结果

- `npm test`：85 / 85 通过
- MASTER protection regression：22 / 22 通过
- TypeScript build：通过
- `npm audit --omit=dev`：0 个已报告漏洞
- Stable 30.8.1 代表性真机 Smoke：通过

## 开源与许可证

项目采用 MIT License。

第三方来源和许可证信息见：

- `THIRD_PARTY_NOTICES.md`
- `docs/open-source-origins.md`
