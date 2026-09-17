# DPM Production 工具

DPM Production 保留的是这个项目里专门面向生产文件的安全工作流。

它和 Illustrator Core 是刻意分开的：

- **Illustrator Core**：直接操作当前 Illustrator 文档
- **DPM Production**：用于 MASTER → Work Copy 的受保护生产流程

只有 DPM Production 工具要求确认 MASTER / Work Copy 身份。

## 当前公开工具

| 工具 | 用途 | 后端 | 保护机制 |
| --- | --- | --- | --- |
| `create_work_copy` | 将一个已保存的 MASTER 复制到明确的工作路径，并创建受控会话。 | DPM 文件系统验证器 + Managed Session | MASTER 保护、内容 Hash、活动 Work Copy 精确身份校验 |
| `reconcile_work_copy` | 当大型 Illustrator 文件打开较慢时，重新确认之前尚未完成授权的 Work Copy。 | DPM Managed Session | 在 Work Copy 精确身份重新确认之前，不允许写入 |
| `dpm_save_work_copy` | 保存已经授权的 Work Copy。 | DPM Managed Session | 拒绝保存 MASTER，拒绝未知 / 未授权会话 |

DPM Production 公开工具总数：**3**。

## 为什么要和 Core 分开

普通 Illustrator 编辑不应该因为安全流程变得复杂。

例如下面这些操作属于 Core：

```text
画矩形
修改文字
移动对象
Relink 图片
Pathfinder
Expand
Gradient
Export
```

它们直接作用于当前 Illustrator 文档。

但下面这种任务适合 DPM Production：

```text
MASTER.ai
  ↓
create_work_copy
  ↓
WORK-COPY.ai
  ↓
替换姓名 / 图片 / QR
  ↓
保存 / 导出
```

这样可以避免自动化流程把不可替代的 MASTER 直接改坏。

## 当前保留的内部生产能力

以下能力目前仍然保留在项目里，但没有单独作为公开 MCP 工具暴露：

- `SafeMutationContext`
- `ObjectLocator`
- Managed Sessions
- Timeout Quarantine
- 模板指纹 / Profile 基础设施
- 确定性的模板文字替换
- Work Copy 文件系统验证
- QR 生成基础
- CSV 解析
- Excel 第一工作表解析

这些能力是为后续真正的模板 / 批量生产任务准备的。

当前策略是：

> 优先让 Codex 组合现有 MCP 工具完成真实任务；只有重复、稳定、明显值得下沉的流程，才进一步固化成新的生产工具。

因此，它们不会被强制加入普通 Core 编辑路径。
