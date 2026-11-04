# AGENTS.md — 仓库约定（任何 AI/任何会话都适用）

## 这是一个已绑定远端仓库的项目

- 项目根：`f:\vibecoding\game-interaction-sop`
- 仓库身份由根目录的 `.git` 决定：**在项目根或其任意子目录执行 git，操作的就是这个仓库**，不需要任何"绑定"操作，换会话/换 AI 都不变
- 已验证：在 `packages/figma-mcp-server` 下执行 `git rev-parse --show-toplevel` 返回项目根，`origin` 指向本项目

## Git 远端约定（不要改）

| 动作 | 行为 |
|---|---|
| `git push` | **一次推两个仓库**：GitHub（`mj1220980291-glitch/game-interaction-sop`）+ 内网 GitLab（`sup-vc/game-interaction-sop`）。`origin` 配了两条 pushurl，两跳都会执行 |
| `git pull` / `git fetch` | 从 **GitHub** 拉（`origin.url` 指向 GitHub），`main` 已跟踪 `origin/main` |
| 推送结果 | 每条 pushurl 各打印一次结果；任一失败则退出码非 0 |

禁止：

- ❌ 不要 `git remote add/set-url/remove`（除非用户明确要求；改坏了双推就失效）
- ❌ 不要 `git push --force` / `--force-with-lease`（两个仓库都会被覆盖）
- ❌ 不要在项目目录之外执行 git（会操作到别的仓库）
- ❌ 不要提交 `node_modules/`、`dist/`、`coverage/`（`.gitignore` 已含，勿用 `-f` 绕过）
- ❌ push 失败时不要重试猜测凭据：把**原始错误**贴回给用户

## 本机 PATH 事实（重要）

`PATH` 里没有 `node` / `npm`；`git` 已写入用户级 PATH，但**旧进程仍可能读不到**。

- git 不可用时用绝对路径：`"C:\Program Files\Git\cmd\git.exe"`
- node/npm 用绝对路径：
  - `"C:\Program Files\nodejs\node.exe"`
  - `"C:\Program Files\nodejs\npm.cmd"`（或 `npx.cmd`）
- 需要 PATH 的临时写法：`set "PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%"`

## 提交前必过（本项目）

```bat
set "PATH=C:\Program Files\nodejs;%PATH%"
cd packages\figma-mcp-server
npx tsc -p tsconfig.json
npx vitest run --no-file-parallelism    :: 并行会撞 Windows 临时文件锁，必须串行
```

- 版本号三处保持一致：`packages/figma-mcp-server/package.json`、`src/v2/version.ts`（`ENGINE_VERSION` / `REQUIRED_SKILL_VERSION`）、`packages/skill/manifest.json`
- 文档同步：`CHANGELOG.md` + `openspec/HANDOFF.md`（快照）+ 受影响的 `openspec/specs/*/spec.md`

## 标准流程

```bat
git status -sb
git pull --ff-only
git add -A
git commit -m "type(scope): summary (版本号)"
git push
```

commit message 风格参考历史：`fix(render,reconcile): … (0.4.2 / skill 2.4.1)`，正文写中文，说明根因与验证数值。
