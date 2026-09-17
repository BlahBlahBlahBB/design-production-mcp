# 通过 Agent 安装 Illustrator MCP

如果你使用的是能够执行本机终端命令的 Codex / Agent，也可以不手动复制安装命令，直接把下面整段发给 Agent。

推荐模型：**GPT-5.6 Luna / Medium**。这只是安装和环境检查，不需要 Sol。

## 直接发给 Agent 的安装指令

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
   - 如果 HTTPS 因 SSL / TLS 失败，并且 `ssh -T git@github.com` 已认证成功，可以改用 SSH 地址：
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
   “请完全退出并重新打开 Codex，然后打开 Adobe Illustrator 2026 Stable，新建会话并让 Codex调用 `illustrator_status`。”
```

## 安装后如何验证

重启 Codex，打开 **Adobe Illustrator 2026 Stable**，新建一个 Codex 会话，然后发送：

```text
请调用 `design-production-illustrator` MCP 的 `illustrator_status`。
只读取状态，不要修改任何 Illustrator 文档。
告诉我 Illustrator 是否连接成功、当前 Illustrator 版本，以及这个 MCP 是否已经可用。
```

如果 Agent 能正常调用 `illustrator_status` 并返回 Illustrator 状态，说明安装成功。

## 平时其实不用写工具名

安装完成后，正常使用时不必每次都手动写 `illustrator_status` 或其他具体工具名。可以直接用自然语言描述任务，例如：

```text
读取当前 Illustrator 文档，告诉我有多少个文字框、图片和画板，不要修改文档。
```

或者：

```text
把当前选中的两个对象做 Pathfinder Unite，然后导出 SVG。
```

Codex 会根据任务自行组合 Illustrator MCP 工具。只有在首次验证安装时，建议显式指定 `illustrator_status`，这样最容易确认 MCP 是否已经加载。
