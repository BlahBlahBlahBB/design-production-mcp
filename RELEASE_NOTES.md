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
