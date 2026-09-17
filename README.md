# 🗂️ Illustrator MCP

一套面向 **Adobe Illustrator + Codex** 的开源 MCP 工具集。

这个项目把多个成熟的 Illustrator 开源能力整合到同一个 MCP 中，并保留 DPM 自己的生产安全能力。普通 Illustrator 操作可以直接作用于当前文档；只有需要保护 MASTER 文件的生产流程，才使用独立的 Work Copy 安全机制。

当前版本：**v0.1.0**  
发布说明：[RELEASE_NOTES.md](RELEASE_NOTES.md)

<br>

## ⭕️ 目前能做什么

当前公开能力分为两部分：

- **Illustrator Core：74 个公开工具**
  - 67 个来自 IE3JP `illustrator-mcp-server`
  - 2 个来自 Alexander Ladygin
  - 4 个来自 Creold / Sergey Osokin
  - 1 个 DPM 状态工具 `illustrator_status`
- **DPM Production：3 个公开生产安全工具**

### Illustrator Core

Core 工具直接操作 **Illustrator 当前打开的文档**，不要求先创建 Work Copy。

主要能力包括：

- 文档：新建、打开、关闭、保存、读取文档信息和结构、Undo、切换 Illustrator 目标版本
- 绘图：矩形、椭圆、直线、自定义路径、普通文字、路径文字
- 对象：查找、选择、删除、复制、群组、解组、对齐、修改属性、层级顺序、移动图层、坐标转换
- 文字：文字框读取与创建、样式、格式化替换、转轮廓、字体列表、文字一致性检查
- 颜色与样式：颜色、Swatches、Gradient、Graphic Style、颜色替换、Design Tokens、Style Guide
- 图片与 SVG：Place、Relink、Embed、读取图片信息、可编辑 SVG、Image Trace
- 图层与画板：图层管理、画板管理、Fit Artboard to Selection、Duplicate Active Artboard
- Pathfinder：Unite、Minus Front、Minus Back、Intersect、Exclude、Divide、Trim、Merge、Crop、Outline
- Expand：支持 Object / Fill / Stroke / Gradient 展开项
- Symbols / Datasets
- 输出与印前：PNG / JPEG / SVG、PDF、Preflight、Overprint、Separation、Crop Marks

完整的 74 个 Core 工具清单见：

[docs/illustrator-core-tools.md](docs/illustrator-core-tools.md)

### DPM Production

DPM Production 专门用于 **MASTER → Work Copy → 安全修改 / 保存** 的生产流程。

目前公开 3 个工具：

- `create_work_copy`：从已保存的 MASTER 创建工作副本并建立受控会话
- `reconcile_work_copy`：当大型 AI 文件打开较慢时，重新确认工作副本身份
- `dpm_save_work_copy`：只允许保存已授权的工作副本，拒绝把 MASTER 当作目标保存

内部还保留了 `SafeMutationContext`、`ObjectLocator`、Managed Session、Timeout Quarantine、模板基础设施、QR、CSV 和 Excel 解析等能力，为后续批量生产工作流预留。

详细说明见：

[docs/dpm-production-tools.md](docs/dpm-production-tools.md)

<br>

## ⭕️ 适合怎么用

这个 MCP 的目标不是让你手动记住 74 个工具，而是让 **Codex 自己组合这些能力完成 Illustrator 任务**。

例如可以直接说：

> 读取当前 Illustrator 文档，找出所有文字框，把姓名改成张三，把部门改成设计部，然后导出 PDF。

或者：

> 找到当前链接图片并替换成指定的新图片，保持位置和尺寸不变。

对于重要生产文件，可以要求：

> 不允许修改 MASTER，先创建 Work Copy，再完成替换和导出。

<br>

## ⭕️ 已验证环境

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

<br>

# ⚙️ 安装

推荐优先使用 **方式 A：直接把安装指令发给 Agent**。如果你习惯自己用终端，也可以使用方式 B。

## 🔘 方式 A：直接发给 Agent 自动安装

适用于能够在你的 Mac 上执行本机终端命令的 Codex / Agent。

推荐模型：**GPT-5.6 Luna / Medium**。安装和环境检查不需要 Sol。

把下面整个代码框原样发给 Agent：

```text
请在这台 Mac 上安装下面这个 Illustrator MCP：

https://github.com/BlahBlahBlahBB/design-production-mcp

目标：安装并配置 `design-production-illustrator` 本地 stdio MCP，让 Codex 重启后可以直接调用 Illustrator 工具。

请按下面规则执行：

1. 先确认当前系统是 macOS。
2. 检查 Git、Node.js、npm：
   - Node.js 必须 >= 20。
   - 如果 Node.js 缺失或低于 20，先告诉我检测到的版本和路径，并给出最小升级方案。
   - 未经我明确确认，不要自动安装 Homebrew、nvm，也不要擅自修改系统 Node 环境。
3. 如果本机已经存在这个仓库：
   - 先确认它确实是 `BlahBlahBlahBB/design-production-mcp`。
   - 检查工作区是否干净。
   - 如果有未提交改动，停止并告诉我，不要覆盖。
   - 如果干净，切换到 `main` 并同步 `origin/main`。
4. 如果本机没有仓库：
   - 克隆到用户目录下的 `design-production-mcp` 文件夹。
   - 默认先使用 HTTPS。
   - 如果 HTTPS 因 SSL / TLS 失败，并且 `ssh -T git@github.com` 已认证成功，可以改用 SSH：
     `git@github.com:BlahBlahBlahBB/design-production-mcp.git`
5. 进入项目目录后运行：
   `./install.command`
6. 安装器应完成：
   - `npm ci --include=dev`
   - TypeScript build
   - 生成 `dist/src/mcp/stdio.js`
   - 备份 `~/.codex/config.toml`
   - 写入或更新且只保留一个 `[mcp_servers.design-production-illustrator]` 配置
7. 安装完成后检查：
   - `dist/src/mcp/stdio.js` 存在
   - `~/.codex/config.toml` 中 `design-production-illustrator` 只出现一次
   - 配置中的 Node 路径和 MCP entrypoint 都是绝对路径且真实存在
8. 不要修改任何 Illustrator 文档，不要启动 Adobe Illustrator Beta。
9. 完成后只汇报：
   - Node 版本和路径
   - 项目实际安装路径
   - build 是否成功
   - Codex MCP 配置是否成功
   - 是否需要我采取额外操作
10. 如果全部成功，明确告诉我：
   “请完全退出并重新打开 Codex，然后打开 Adobe Illustrator 2026 Stable，新建会话并让 Codex 调用 `illustrator_status`。”
```

## 🔘 方式 B：终端一键安装

### 1. 检查 Node.js

本项目需要 **Node.js 20 或更高版本**：

```bash
node -v
npm -v
```

如果 `node -v` 显示 `v20.x.x` 或更高版本，可以继续。

如果没有安装 Node.js，或者显示 `v18`、`v16` 等旧版本，请先从 Node.js 官网安装 Node.js 20+：

https://nodejs.org/

如果你已经使用 `nvm`、`fnm`、`asdf`、`n` 等 Node 版本管理器，也可以直接把当前终端切换到 Node 20+。

> 安装器不会自动修改你的 Node 环境，也不会自动安装 Homebrew / nvm，避免破坏用户已有的开发环境。

### 2. 下载项目

```bash
git clone https://github.com/BlahBlahBlahBB/design-production-mcp.git
cd design-production-mcp
```

### 3. 一键安装 MCP

```bash
./install.command
```

安装器会自动：

1. 检查 macOS
2. 检查 Node.js / npm
3. 检查 Node 版本是否 >= 20
4. 执行 `npm ci --include=dev`
5. 编译 MCP
6. 找到真实 Node 可执行路径
7. 检查 MCP 入口 `dist/src/mcp/stdio.js`
8. 备份 `~/.codex/config.toml`
9. 写入 / 更新 `design-production-illustrator`
10. 保留其他 Codex 配置，并避免重复 MCP 条目

如果系统提示没有执行权限：

```bash
chmod +x install.command uninstall.command
./install.command
```

<br>

## ⭕️ 安装后验证

安装完成后：

1. 完全退出 Codex
2. 重新打开 Codex
3. 打开 **Adobe Illustrator 2026 Stable**
4. 新建一个 Codex 会话
5. 发送下面这段：

```text
请调用 `design-production-illustrator` MCP 的 `illustrator_status`。
只读取状态，不要修改任何 Illustrator 文档。
告诉我 Illustrator 是否连接成功、当前 Illustrator 版本，以及这个 MCP 是否已经可用。
```

如果能正常返回 Illustrator 状态，说明安装成功。

平时正常使用时不需要手动写工具名，可以直接用自然语言描述 Illustrator 任务。

<br>

## ⚠️ 安装问题排查

### Node 版本过低

如果安装器提示 Node 版本低于 20，会显示当前 Node 版本和路径。请升级或切换到 Node 20+ 后重新运行安装器。

确认当前实际版本：

```bash
node -v
which node
```

如果明明安装了新版但仍显示旧版，通常是当前终端的 `PATH` 或 Node 版本管理器仍指向旧版本。

### 找不到 `./install.command`

说明当前终端不在项目目录：

```bash
cd /你的/design-production-mcp/路径
./install.command
```

### GitHub HTTPS / SSL 拉取失败

如果浏览器能打开 GitHub，但 Git HTTPS 失败，并且 GitHub SSH 已认证成功，可以切换当前仓库 remote：

```bash
git remote set-url origin git@github.com:BlahBlahBlahBB/design-production-mcp.git
```

然后重新执行 `git pull` / `git fetch`。

<br>

## ⚙️ 手动安装

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

<br>

## 🚼 卸载

在项目目录运行：

```bash
./uninstall.command
```

卸载器只会移除：

```toml
[mcp_servers.design-production-illustrator]
```

不会删除 Illustrator 文件、项目源码、其他 MCP 或其他 Codex 配置。卸载前同样会备份 Codex 配置。

<br>

## 📄 Core 与 Production 的区别

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

<br>

## ⚠️ 当前验证状态

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

<br>

## 🔮 开源来源

本项目整合并保留了以下开源项目的许可和归属信息：

- IE3JP / `illustrator-mcp-server` — MIT
- Alexander Ladygin / `illustrator-scripts` — MIT
- Creold / Sergey Osokin / `illustrator-scripts` — MIT
- SheetJS Community Edition — Apache-2.0

详细来源、版本和本地修改记录见：

- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- [docs/open-source-origins.md](docs/open-source-origins.md)

Jinkeda / `Illustrator_MCP` 曾用于研究，但因为当时没有从仓库根目录明确验证许可证，本项目 **没有复制其源码**。

<br>

## ⚠️ 安全边界

本项目只暴露固定、类型化的 MCP 工具，不提供任意 JSX、Shell 或任意 Illustrator 菜单命令执行入口。

普通 Core 工具会直接修改当前文档；如果文件是不可替代的 MASTER，请使用 DPM Production 的 Work Copy 工作流，或者先手动备份。

## License

本项目采用 **MIT License**。

第三方代码仍受各自原始许可证和版权声明约束，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
