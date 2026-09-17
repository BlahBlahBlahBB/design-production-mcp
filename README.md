# Illustrator MCP

一套面向 **Adobe Illustrator + Codex** 的开源 MCP 工具集。

这个项目把多个成熟的 Illustrator 开源能力整合到同一个 MCP 中，并保留 DPM 自己的生产安全能力。普通 Illustrator 操作可以直接作用于当前文档；只有需要保护 MASTER 文件的生产流程，才使用独立的 Work Copy 安全机制。

当前版本：**v0.1.0**  
发布说明：[RELEASE_NOTES.md](RELEASE_NOTES.md)

## 目前能做什么

当前公开能力共分为两部分：

- **Illustrator Core：74 个公开工具**
  - 67 个来自 IE3JP `illustrator-mcp-server`
  - 2 个来自 Alexander Ladygin
  - 4 个来自 Creold / Sergey Osokin
  - 1 个 DPM 状态工具 `illustrator_status`
- **DPM Production：3 个公开生产安全工具**

### Illustrator Core

Core 工具直接操作 **Illustrator 当前打开的文档**，不需要先创建 Work Copy。

主要能力包括：

#### 文档与会话

- 新建、打开、关闭、保存文档
- 读取文档信息和文档结构
- 切换 Illustrator 目标版本
- Undo
- 读取 MCP / Illustrator Bridge 状态

#### 基础绘图

- 矩形
- 椭圆
- 直线
- 自定义路径
- 普通文字
- 路径文字

#### 对象编辑

- 查找对象
- 选择对象
- 删除对象
- 复制对象
- 群组 / 解组
- 对齐
- 修改对象属性
- 调整层级顺序
- 移动到指定图层
- 坐标转换

#### 文字

- 创建文字框
- 列出全部文字框
- 获取文字框详情
- 应用文字样式
- 列出文字样式
- 检查文字一致性
- 文字转轮廓
- 格式化文字替换
- 字体列表

#### 颜色与样式

- 读取文档颜色
- 管理 Swatches
- 创建 Gradient
- 替换颜色
- 放置色块
- 指定颜色配置文件
- Graphic Style
- 对比度检查
- 提取 Design Tokens
- 生成 Style Guide

#### 图片与 SVG

- 放置图片
- 读取图片信息
- Relink 链接图片
- Embed 图片
- 导入可编辑 SVG
- Image Trace / 图像描摹

#### 图层与画板

- 读取图层
- 管理图层
- 读取画板
- 管理画板
- Fit Artboard to Selection
- Duplicate Active Artboard

#### Pathfinder 与 Expand

- Pathfinder Unite
- Minus Front
- Minus Back
- Intersect
- Exclude
- Divide
- Trim
- Merge
- Crop
- Outline
- Object > Expand
- 可控制 Object / Fill / Stroke / Gradient 展开项

`expand_objects` 作用于 Illustrator 当前选区；可以先使用 `select_objects` 按 UUID 选中对象，再执行 Expand。

#### Symbols 与数据

- 读取 Symbols
- 放置 Symbol
- 管理 Datasets

#### 输出与印前

- PNG / JPEG / SVG 等导出
- PDF 导出
- Preflight 检查
- Overprint 信息
- Separation 信息
- Crop Marks

#### 其他分析能力

- 获取 Groups
- 获取 Guidelines
- 获取 Path Items
- 获取 Effects
- 获取当前 Selection
- Resize for Variation

完整的 74 个 Core 工具清单见：

[docs/illustrator-core-tools.md](docs/illustrator-core-tools.md)

## DPM Production

DPM Production 专门用于 **MASTER → Work Copy → 安全修改 / 保存** 的生产流程。

目前公开 3 个工具：

- `create_work_copy`：从已保存的 MASTER 创建工作副本并建立受控会话
- `reconcile_work_copy`：当大型 AI 文件打开较慢时，重新确认工作副本身份
- `dpm_save_work_copy`：只允许保存已授权的工作副本，拒绝把 MASTER 当作目标保存

内部还保留了：

- `SafeMutationContext`
- `ObjectLocator`
- Managed Session
- Timeout Quarantine
- 模板指纹 / 模板基础设施
- 确定性文字替换
- QR 生成基础
- CSV 解析
- Excel 第一工作表解析

这些内部能力为后续模板和批量生产工作流预留，不会强制套在普通 Core 编辑操作上。

详细说明见：

[docs/dpm-production-tools.md](docs/dpm-production-tools.md)

## 适合怎么用

这个 MCP 的设计目标不是让你逐个手动调用 74 个工具，而是让 **Codex 自己组合这些能力完成 Illustrator 任务**。

例如可以直接对 Codex 说：

> 读取当前 Illustrator 文档，找出所有文字框，把姓名改成张三，把部门改成设计部，然后导出 PDF。

或者：

> 找到当前链接图片并替换成指定的新图片，保持位置和尺寸不变。

或者：

> 选中这两个对象执行 Pathfinder Unite，然后把结果导出成 SVG。

对于生产文件，可以要求：

> 不允许修改 MASTER，先创建 Work Copy，再完成替换和导出。

Codex 会根据任务组合 Core 工具和 DPM Production 工具，不需要为每一种模板重新开发一套 MCP。

## 已验证环境

当前正式验证环境：

- **macOS**
- **Node.js 20 或更高版本**
- npm
- **Adobe Illustrator 2026 Stable 30.8.1**
- 支持本地 stdio MCP 的 Codex

说明：

- **不需要 Adobe Illustrator Beta**
- Illustrator 26.1 目前仍属于 **未正式认证**
- Windows 当前也属于 **未正式认证**

## 快速安装

### 1. 安装 Node.js

先确保电脑已经安装 Node.js 20 或更高版本：

```bash
node -v
npm -v
```

如果 `node -v` 显示 `v20` 或更高版本即可。

### 2. 下载项目

在终端运行：

```bash
git clone https://github.com/BlahBlahBlahBB/design-production-mcp.git
cd design-production-mcp
```

### 3. 一键安装 MCP

运行：

```bash
./install.command
```

安装器会自动完成：

1. 检查 macOS
2. 检查 Node.js / npm
3. 执行 `npm ci --include=dev`
4. 编译 MCP
5. 找到当前真实的 Node 可执行路径
6. 找到 MCP 编译入口 `dist/src/mcp/stdio.js`
7. 备份 `~/.codex/config.toml`
8. 自动写入 / 更新 `design-production-illustrator` MCP 配置
9. 保留其他已有 Codex 配置

安装器可以重复运行，不会重复添加多个 MCP 配置。

如果系统提示没有执行权限，可以先运行：

```bash
chmod +x install.command uninstall.command
./install.command
```

### 4. 重启 Codex

安装完成后：

1. 完全退出 Codex
2. 重新打开 Codex
3. 打开 Adobe Illustrator 2026 Stable
4. 新建一个 Codex 会话

然后让 Codex 调用：

```text
illustrator_status
```

如果能正常返回 Illustrator 状态，说明 MCP 已安装成功。

## 手动安装

如果不想使用一键安装器，也可以手动安装：

```bash
git clone https://github.com/BlahBlahBlahBB/design-production-mcp.git
cd design-production-mcp
npm ci --include=dev
npm run build
```

然后编辑：

```text
~/.codex/config.toml
```

加入：

```toml
[mcp_servers.design-production-illustrator]
command = "/你的/node/绝对路径"
args = ["/你的/design-production-mcp/绝对路径/dist/src/mcp/stdio.js"]
```

Node 的真实路径可以通过下面命令查看：

```bash
node -p 'process.execPath'
```

## 卸载

如果只想从 Codex 中移除这个 MCP，而不删除项目源码：

```bash
./uninstall.command
```

卸载器只会移除：

```toml
[mcp_servers.design-production-illustrator]
```

不会删除：

- 你的 Illustrator 文件
- 项目源码
- 其他 MCP
- 其他 Codex 配置

卸载前同样会备份 Codex 配置。

## Core 与 Production 的区别

### Illustrator Core

适合普通 Illustrator 操作：

```text
Codex
  ↓
Illustrator MCP Core
  ↓
当前 Illustrator 文档
```

Core 不要求 Work Copy，行为更接近正常人工操作 Illustrator。

### DPM Production

适合重要生产文件：

```text
MASTER
  ↓
create_work_copy
  ↓
受控 Work Copy
  ↓
修改 / 保存 / 导出
```

这条路径专门防止 MASTER 被误保存或被直接写入。

## 当前验证状态

在 Adobe Illustrator 2026 Stable 30.8.1 上，代表性 Smoke Test 已验证：

- 文档读取：通过
- 创建基础图形：通过
- 创建文字：通过
- 图层操作：通过
- Place Image：通过
- Linked Image Relink：通过
- Embed Image：通过
- Pathfinder：通过
- Expand：通过
- Fit Artboard：通过
- Gradient：通过
- Export：通过

项目测试状态：

- `npm test`：**85 / 85 通过**
- MASTER protection regression：**22 / 22 通过**
- TypeScript build：通过
- `npm audit --omit=dev`：**0 个已报告漏洞**

## 开源来源

本项目整合并保留了以下开源项目的许可和归属信息：

- IE3JP / `illustrator-mcp-server` — MIT
- Alexander Ladygin / `illustrator-scripts` — MIT
- Creold / Sergey Osokin / `illustrator-scripts` — MIT
- SheetJS Community Edition — Apache-2.0

详细来源、版本和本地修改记录见：

- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- [docs/open-source-origins.md](docs/open-source-origins.md)

Jinkeda / `Illustrator_MCP` 曾用于研究，但因为当时没有从仓库根目录明确验证许可证，本项目 **没有复制其源码**。

## 安全边界

本项目只暴露固定、类型化的 MCP 工具，不提供任意 JSX、Shell 或任意 Illustrator 菜单命令执行入口。

普通 Core 工具会直接修改当前文档；如果文件是不可替代的 MASTER，请使用 DPM Production 的 Work Copy 工作流，或者先手动备份。

## License

本项目采用 **MIT License**。

第三方代码仍受各自原始许可证和版权声明约束，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
