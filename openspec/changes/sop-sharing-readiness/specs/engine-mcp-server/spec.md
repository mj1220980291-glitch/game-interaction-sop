## ADDED Requirements

### Requirement: 安装片段 SHALL 使用 node 绝对路径

仓库提供的安装片段（`scripts/install-mcp.mjs` 输出的一切形式：CodeMaker 表单、Codex TOML、`mcpServers` JSON、默认提示）SHALL 使用运行安装脚本时的 node 绝对路径（`process.execPath`），SHALL NOT 输出裸 `node`。

`SETUP.md` 的配置表 SHALL 与之一致，并说明「宿主 PATH 与 shell PATH 不一致时会出现 `spawn ENOENT`」。

#### Scenario: PATH 无 node 的机器

- **WHEN** 目标机器 PATH 里没有 node，按安装片段配置宿主
- **THEN** 宿主 SHALL 能拉起 MCP 进程（片段里是绝对路径），SHALL NOT 出现 `spawn ENOENT`

#### Scenario: 仓库挪位置

- **WHEN** 仓库路径变化后重新运行安装脚本
- **THEN** 输出片段中的 `args` SHALL 指向新路径，`command` SHALL 仍为当前 node 绝对路径
