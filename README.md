# game-interaction-sop

AI-driven SOP for turning a game UI requirement doc into a structured
Figma interaction document — end-to-end in a single conversation.

> Strategy doc / UI spec → v2 Markdown (validated) → Figma 1:14 document  
> Powered by **figma-interaction-doc-engine** MCP + AI agent skill.

> **首次配置？请把 [SETUP.md](./SETUP.md) 交给你的 AI Agent，让它引导你完成安装。**

> **第一次用？先看图文说明书：[docs/tutorial/index.html](./docs/tutorial/index.html)** — 这是什么、怎么装通、哪里容易出错。

> **新团队接入：[docs/onboarding.md](./docs/onboarding.md)** — 30 分钟四步走通，附三条已知限制与卡点分流。

> **v2（SOP 2.0 / 引擎 0.2）能力汇总：[V2.md](./V2.md)** — 库引用模式、真实实例主图、`- @职能：` 条目、文风 mod 与学习回写。变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

---

## What you get

| Package | What it is | How it's used |
|---|---|---|
| [`packages/figma-mcp-server`](./packages/figma-mcp-server) | The engine, exposed as the `figma-interaction-doc-engine` MCP server. Parses v2 Markdown and writes into the Figma template. Also proxies all figma-console tools. | Register as an MCP server (see [SETUP.md](./SETUP.md)) |
| [`packages/skill`](./packages/skill) | Markdown SOP bundle (Phase 0–6 + references) for AI agents. | `npm run install-skill -- --agent codemaker` |

The skill drives the conversation through the phases; at Phase 4 it calls
the engine's `validate_v2_markdown` and `render_v2_markdown_to_figma`
MCP tools. No glue code required from the agent. Phase 5 distills manual
wording edits into the project style file; Phase 6 maintains the pattern library.

---

## Prerequisites

- Node.js ≥ 20
- An AI agent with MCP support: **Claude Desktop / Codex / Cursor / Cline / ...**
- 不需要准备模板：仓库自带基线模板包（见下节），装完就能渲染

The [figma-console MCP plugin](https://github.com/southleft/figma-console-mcp)
runtime (v1.23.0, MIT) ships bundled in this repo at
[`vendor/figma-console-mcp-1.23.0.tgz`](./vendor/) — recipients don't need
to install it separately. `npm run install-mcp` unpacks it locally and
prints the config snippet to paste into your agent's MCP config file.

## The Figma template

**开箱即用：仓库自带基线模板包**，随引擎分发、换机器不会丢：

| 文件 | 内容 |
|---|---|
| `packages/figma-mcp-server/assets/packs/default.json` | 官方 1.14 |
| `packages/figma-mcp-server/assets/packs/蛋仔派对.json` | 蛋仔派对（深色底） |

没有做任何模板配置时，引擎按下面的顺序查找，最后两级就是这两份基线包：

1. `$GISOP_TEMPLATE_PACK`（显式路径）
2. `<项目根>/.interaction-sop/template.json`
3. `~/.game-interaction-sop/templates/<项目>.json`（项目名取 `$GISOP_PROJECT`）
4. `~/.game-interaction-sop/templates/default.json`
5. 引擎包内 `assets/packs/<项目>.json`
6. 引擎包内 `assets/packs/default.json`

渲染前可以先体检一次：`audit_template_pack`（`deep: true` 会做 key 冒烟）。

### 用自己的模板

**不要手写模板包**——`componentKey` 是库发布快照的产物，手抄必错。走这条路：

```
figma_compile_template(phase=compile)   # 把源模板的部件编译进我们库的 _staging
  → 在 Figma 里人工发布（没有发布 API）
  → figma_compile_template(phase=verify)  # 回填 4 个 key + 几何 + 文档级留白
  → 落 assets/packs/<项目>.json
```

基线包里的 key 指向**公司内部「官方 1.14」组件库**，团队外无法 import ——
外部团队需要按上面流程编自己模板的包。逐项说明见
[`packages/figma-mcp-server/assets/packs/README.md`](./packages/figma-mcp-server/assets/packs/README.md)
与 [`docs/onboarding.md`](./docs/onboarding.md)。

`roleBlock`（`@职能` 用的 7 个彩色标签变体 key）同样随包分发：包里有就用包里的，
没有才读 `~/.game-interaction-sop/template.json`。

---

## Project style mod

Optional per-project style files in `.interaction-sop/` tune **how** the
Markdown is written without touching the phases:

| File | Role | Written by |
|---|---|---|
| `style.config.json` | light config: which bundled base style is the default | Phase 1 onboarding, or humans |
| `style.md` | clean project baseline; read-only | humans only, never the agent |
| `style_own.md` | personal style; active as soon as it exists | Phase 5 auto-distillation |
| `style_<name>.md` | imported / shared styles | import or Phase 5 when selected |

Resolution order (first match wins): `style_own.md` present → use it silently;
otherwise `style.md` present → use it; otherwise `style.config.json` with a valid
`defaultBaseStyle` → use that bundled base style
(`packages/skill/references/style-base-<key>.md`); **nothing present → Phase 1
onboarding** asks the user to pick one of the 3 bundled base styles (or generate
all 3 for comparison) and records the choice in `style.config.json`, so a fresh
install works with zero configuration.

- `verbosity` — terse / normal / verbose, bullets per cluster
- `role_annotation` — when a rule becomes a `- @职能：…` bullet (and therefore
  a 职能标记 component), or never
- `wording` — tone, person, banned words, term substitutions

Contract: `packages/skill/references/style-mod-schema.md`. Missing files = skill
defaults, nothing breaks.

### Style learning loop (Phase 5)

Phase 2 stores a snapshot of the Markdown it saves
(`.interaction-sop/snapshots/<需求名>.md`). After the Figma document is
delivered, Phase 5 diffs that snapshot against the current file (and optionally
reads back wording the user edited inside Figma), lists the reusable style
entries once for confirmation, and writes the accepted ones back — first copy of
`style_own.md` is seeded from `style.md`, which itself is never modified.

### Main images are live instances

`figma_instance` assets place a **real instance** of a design master (or a
pasted sub-instance) over 主图占位: the placeholder is scaled/centred and then
removed, the instance stays linked to its component. Unlike `figma_node`, nothing
is rasterized.

```json
{ "01": { "type": "figma_instance", "fileKey": "…", "nodeId": "523:7289" } }
```

---

## Quick start

**完整步骤见 [SETUP.md](./SETUP.md)**，以下是最简流程：

```bash
# 1. 编译引擎
cd packages/figma-mcp-server && npm install && npm run build

# 2. 安装 SOP Skill
cd ../.. && npm run install-skill -- --agent codemaker   # 或 claude/cursor/cline

# 3. 生成 MCP 配置片段（只配一个 server）
npm run install-mcp -- --agent codemaker
#    把打印出来的片段贴进 agent 的 MCP 配置；`command` 是 node 的绝对路径，
#    如果打印成裸 `node`，宿主在 PATH 没 node 的机器上会报 spawn ENOENT
```

新开 Agent 会话后直接喂策划文档即可，Skill 会全程引导（Phase 0–6）。

---

## How it works

```
Phase 0  翻库咨询     查项目模式库（无库静默跳过）
     ↓
Phase 1  需求挖掘     先问有没设计稿（有图=以图提问，无图=读策划文档）→ 澄清阻塞问题 → 确认本次用哪份文风
     ↓
Phase 2  v2 Markdown  生成结构化交互文档（每簇默认配图）→ 用户审核 → 保存磁盘 + diff 快照
     ↓
Phase 3  资产确认     收集截图 / Figma 链接 / 或跳过用占位（母版走 figma_instance）；映射配图条目
     ↓
Phase 4  写入 Figma   读模板配置 preflight → 引擎渲染（气泡 + 说明块 + 配图占位）→ 截图做配图审计、缺图提醒
     ↓
Phase 5  文风沉淀     快照 diff / Figma 表述读回 → 列清单确认 → 写入本次生效的文风
     ↓
Phase 6  模式库维护   按风险分级增量维护项目模式库
```

- **Skill**（`packages/skill/`）— 引导对话，生成并验证 v2 Markdown
- **Engine**（`packages/figma-mcp-server/`）— 解析 Markdown，写入 Figma 节点
- **figma-console-mcp**（`vendor/`）— 实际操作 Figma 桌面端的运行时，由引擎内部管理

---

## Development

```bash
npm install                     # installs workspaces
npm run build                   # tsc for all packages
npm run test                    # vitest across packages

# engine-only
npm run build --prefix packages/figma-mcp-server
npm run test  --prefix packages/figma-mcp-server
```

---

## License

MIT.

## Credits

The v2 Markdown contract and the Figma template design rules were
hardened through real-world runs. See:
- [`packages/figma-mcp-server/docs/figma-mcp-pitfalls.md`](./packages/figma-mcp-server/docs/)
  for the full list of MCP / template coord-system pitfalls and how the
  engine enforces safety
- [`openspec/specs/`](./openspec/specs/) for the current capability specs,
  and [`openspec/changes/archive/`](./openspec/changes/archive/) for the
  rationale behind each shipped change

---

## BREAKING change — proxy-figma-console-tools-from-engine

The MCP server `figma-interaction-doc-engine` now **proxies all
`figma-console-mcp` tools** through itself. MCP hosts (CodeMaker, Cursor,
etc.) MUST configure only **one** Figma-related MCP server going forward.

If you previously configured a standalone `figma-console` MCP server in
addition to `figma-interaction-doc-engine`, **remove the standalone entry**.

See migration steps in
[`packages/figma-mcp-server/README.md`](./packages/figma-mcp-server/README.md#configuration-migration-breaking--proxy-figma-console-tools-from-engine).
