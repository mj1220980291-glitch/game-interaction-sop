## ADDED Requirements

### Requirement: 可重复的新用户沙盒

仓库 SHALL 提供 `scripts/sandbox/newuser.mjs`，用于从零模拟「用户拿到仓库并完成接入」的全过程，且可反复运行：

- 支持 `--reset` 重建与 `--keep` 保留
- 支持 `--source worktree`（取当前工作区，含未提交改动）与 `--source git --url <仓库地址>`（模拟真实拉取）
- SHALL 隔离 `HOME` / `USERPROFILE` / `TEMP` / `TMP` 与 npm cache，使「用户目录无任何历史配置」成立
- 支持 `--path-mode no-node`：验证 `node` 不在 PATH 时的现象与文档给出的绝对路径解法
- 默认 SHALL NOT 连接 Figma；`--with-figma` 才追加需要 Figma 的步骤，失败记为 `skipped` 而非失败

#### Scenario: 改完代码后重跑

- **WHEN** 开发者修改源码后执行 `node scripts/sandbox/newuser.mjs --source worktree`
- **THEN** 沙盒 SHALL 重建为干净状态并从当前工作区复制代码，SHALL NOT 复用上一次的 `node_modules` 与用户配置

#### Scenario: 新机器没有历史配置

- **WHEN** 沙盒启动
- **THEN** 其 `HOME` / `USERPROFILE` 指向沙盒内的空目录，`~/.game-interaction-sop` 不存在

### Requirement: 沙盒报告可比较

沙盒 SHALL 输出 `docs/pilot/reports/<时间>.json` 与同名 `.md`，每步至少包含：

- `id`（步骤标识）
- `status`（`pass` / `fail` / `skipped`）
- `durationMs`
- `firstError`（失败时的首条错误，成功为空）
- `assertions[]`（逐条断言与结果）

两次运行之间 SHALL 可以直接比较 `status` 与 `firstError` 判断是否回归；`durationMs` 只记录不比较。

#### Scenario: 回归对比

- **WHEN** 同一机器上先后运行两次
- **THEN** 报告中的 `status` / `firstError` SHALL 完全一致

### Requirement: 引导链断言

沙盒 SHALL 断言「新用户第一眼看到的信息」是准确的，至少包含：

- 仓库根目录存在 `README.md`、`SETUP.md`、`docs/onboarding.md`
- README SHALL 提到仓库自带基线模板包（零配置可渲染）
- README SHALL 提到 `install-mcp` 会生成 MCP 配置片段

#### Scenario: README 过时

- **WHEN** README 中删去「基线包」相关说明
- **THEN** `guidance` 步骤 SHALL 失败，并指出缺失的那句话
