## 1. 沙盒脚本（P0）

- [x] 1.1 `scripts/sandbox/newuser.mjs`：`--root` / `--reset` / `--keep` / `--source worktree|git` / `--url` / `--path-mode normal|no-node` / `--with-figma` / `--only`
- [x] 1.2 隔离 `HOME` / `USERPROFILE` / `TEMP` / `TMP` / npm cache；worktree 复制按 `git ls-files`（只带 git 跟踪的文件，含未提交修改）
- [x] 1.3 八步断言：env / install / build / install-mcp / engine-boot / pack-resolution / contract / guidance
- [x] 1.4 报告：`docs/pilot/reports/<时间>.md|json`，字段固定（id/status/durationMs/firstError/assertions）
- [x] 1.5 加 `npm run sandbox:newuser` 入口

## 2. 引导链修正（P0）

- [x] 2.1 README：Prerequisites 与模板段落改写 —— 仓库自带基线包、零配置可渲染；自己模板的接入路径
- [x] 2.2 README：Quick start 补 `npm run install-mcp` 生成配置片段这一步
- [x] 2.3 `docs/onboarding.md`：新增第 0 步（拿到的是什么）、零配置说明、自备/借用模板路径
- [x] 2.4 `docs/onboarding.md`：补三个坑（禁用条目占 9223 / 跨文件 import 要关开库 / `@职能` 写法）

## 3. 计划对齐（P1）

- [x] 3.1 `sop-sharing-readiness/tasks.md`：新增 0.x 引导链审计、6.4 沙盒基线、7.4 重跑 diff、8.x 借用模板链路
- [x] 3.2 `docs/pilot/reports/` 首份基线报告入库

## 4. 回归

- [x] 4.1 worktree 模式 8 步全绿（`20261112-143755` 起）
- [x] 4.2 连跑两次全部 pass（第二轮 `--keep`）
- [x] 4.3 `no-node` 模式三条断言成立
- [x] 4.4 断言有效性已验证：改 README 前 `guidance` 为红，改后转绿

## 5. 沙盒抓出的问题（已修，引擎 0.4.11）

- [x] 5.1 `phase=contract` 不需要 Figma 后端（`V2_BACKEND_UNAVAILABLE` 误伤）
- [x] 5.2 引擎子进程 `cwd` 泄漏宿主仓库 → 模板包命中宿主 `.interaction-sop/template.json`
- [x] 5.3 `--keep` 保留用户目录 → 不再是「新机器」
- [x] 5.4 Windows 上 `spawn npm.cmd` 抛 `spawn EINVAL` → 改 `node + npm-cli.js` 绝对路径
