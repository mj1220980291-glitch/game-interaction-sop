## Why

推广到别的设计团队，唯一的真验收是「一个没用过的人照着仓库独立走通」。现在缺的不是文档，是**可重复的从零环境**：

- 每次手工模拟都要重新清理 `~/.game-interaction-sop`、记住哪一步做过，**不可重复**；
- 改完代码后无法快速回答「这次改动会不会让新用户装不上」；
- 2026-11-11 一天里撞到的三个坑（禁用条目占 9223、跨文件 import 需关开库、`@职能` 写法）全是**内部人才知道怎么绕**的，没有环境能把它们变成可复现的用例；
- README 仍写着「你需要一份主模板副本」，而仓库现在自带基线包、零配置就能渲染——新用户会被引到一个多余动作上。

## What Changes

- **新增可重复沙盒脚本** `scripts/sandbox/newuser.mjs`：
  - `--reset` 一键重建；`--source worktree|git` 分别模拟「改完待验」与「真实拉仓库」
  - 隔离 `HOME` / `USERPROFILE` / `TEMP` / npm cache → 等价于「新机器没有任何历史配置」
  - `--path-mode no-node` 复现「PATH 里没有 node」
  - 逐步骤断言 + 计时 + 首个错误，产出 `docs/pilot/reports/<时间>.md|json`，两次运行可 diff
  - 默认不连 Figma；`--with-figma` 才跑渲染
- **引导链修正**：README 的 Prerequisites / 模板段落改为「仓库自带基线包，零配置可渲染 + 想用自己模板怎么走」
- **`docs/onboarding.md` 补第 0 步**（拿到的是什么、零配置说明、自备/借用模板的路径、三个坑）
- **`sop-sharing-readiness` 增加任务**：0.x 引导链审计、6.4 沙盒跑通并留基线报告、7.4 改动后重跑 diff 为空、8.x 借用外部团队模板的完整链路

## Capabilities

### New Capabilities

- `newuser-sandbox`：可重复的「新用户从零」验证环境

### Modified Capabilities

（无 — 只增工具与文档，不改引擎行为）

## Impact

- `scripts/sandbox/newuser.mjs`（新增）
- `docs/pilot/reports/`（基线报告）
- `README.md`、`docs/onboarding.md`
- `openspec/changes/sop-sharing-readiness/tasks.md`（范围补充）
- **不在范围**：宿主侧（CodeMaker 面板）自动化、真人可用性测试
