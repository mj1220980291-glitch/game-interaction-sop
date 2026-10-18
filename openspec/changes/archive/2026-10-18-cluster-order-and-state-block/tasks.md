## 1. 真机确认

- [x] 1.1 在「Agent草稿」模板上读出 `正文/规则` TEXT 的字体族与字重，确认同族可加载的粗体字重（`Bold` / `SemiBold` / `Semibold` / `Medium`），结果记入 design.md Open Questions

## 2. 状态行识别

- [x] 2.1 新增 `packages/figma-mcp-server/src/v2/state-line.ts`：`parseStateLine(text)` 按 design D1 返回 `{ name, nameEnd } | null`；另导出 `isLegacyStatePrefix(text)`（`isMotionLine` 已于 6.5 删除）
- [x] 2.2 单测覆盖：`默认状态`、`冷却状态：…`、半角冒号、`进入战斗状态后…`（不命中）、超 10 字 head、head 含标点、`配图：…状态`、`动效需求：…`

## 3. Parser 软提醒

- [x] 3.1 `ir.ts` 新增警告码 `W_STATE_LINES_SCATTERED`、`W_MOTION_NOT_LAST`（6.5 删除）、`W_LEGACY_STATE_PREFIX`、`W_STATE_BOLD_UNAVAILABLE`
- [x] 3.2 `parser.ts` 在 `parseClusters` 按分组检查三条提醒（忽略 `配图：` 行），带行号与簇名 context
- [x] 3.3 单测：每条提醒的命中与不命中各一例；三条提醒均不影响 `ok`

## 4. Backend 加粗写入

- [x] 4.1 `figma-client.ts`：`setMultipleTextContents` 的 update 与 `applyOps` 的 `setText` op 增加可选 `bold?: number`；`setMultipleTextContents` 返回值增加 `boldUnavailable?: string[]`（字体族）；同步更新 `applyOps` 返回类型
- [x] 4.2 `figmaConsoleBackend.ts`：按 design D3 在插件脚本内解析常规 / 粗体字重（每族一次），并入现有字体去重加载；写入 characters 后按 `bold` 设置字重；`bold` 缺省时代码路径与现在一致
- [x] 4.3 更新测试用的 fake backend，记录收到的 `bold` 值（另加插件脚本单测 `tests/state-bold-backend.spec.ts`）

## 5. 渲染与同步

- [x] 5.1 `render.ts`：无配图扁平路径、`appendBulletsInOrder`（原位配图 / `####`）写 bullet 时附带 `bold`（状态行为 `nameEnd`，否则 0）；标题、编号、配图提示等其他文字不带
- [x] 5.2 `render.ts`：收集 `boldUnavailable`，每个字体族产生一条 `V2_W_STATE_BOLD_UNAVAILABLE`
- [x] 5.3 `reconcile/plan.ts`：bullet 条目的 `setText` op 附带 `bold`；`reconcile/index.ts` 透传到 `applyOps`
- [x] 5.4 单测：状态行 / 普通规则 / 纯名字状态行三种 `bold` 值；`render-subgroups.spec.ts` 的 `BASELINE_CALL_SEQUENCE` 不改仍通过；`render-inline-figures.spec.ts` 中 `状态·` 示例改为新写法
- [x] 5.5 单测（reconcile）：普通规则改为状态行、状态行改为普通规则时 op 带正确 `bold`；文字未变时不出 op

## 6. Skill 文档与主 spec

- [x] 6.1 `packages/skill/references/markdown-v2-spec.md`：新增 T9「簇内叙述顺序」与「状态行写法」一节（T10）；W3 状态类示例、T7 示例改为新写法；软约束表加入三条新提醒（W7 / W8 / W9）
- [x] 6.2 `packages/skill/phases/phase2-markdown.md`：自检清单按 delta spec 更新（T7 措辞、新增 T9 与状态行项），并同步 line 258 附近的状态类配图说明
- [x] 6.3 全仓搜索 `状态·` / `状态｜`，确认 skill 与引擎内不再出现旧写法示例（archive 目录除外；主 spec 在 archive 时由 delta 同步）
- [x] 6.4 （2026-10-18 用户追加）T8 动效句式改为"什么情况下，需要什么样的动效"，T8 末尾加状态行 / 动效句对照表；T10 加"状态行不写动效"；phase2 清单、模板注释、T9 例句同步；delta spec 中「动效 bullet 三段式」RENAMED + MODIFIED
- [x] 6.5 （2026-10-18 用户追加）动效句去掉 `动效需求：` 前缀、不用冒号，冒号说明格式只留给状态行；删除 W8 `V2_W_MOTION_NOT_LAST` 与 `isMotionLine`（ir / parser / state-line / 测试）；skill 规范、phase2、delta spec、proposal、design 同步；W9 改号为 W8；build + 185/185 通过

## 7. 验证

- [x] 7.1 `npm run build --prefix packages/figma-mcp-server` 与全部测试通过（186/186；Windows 下并行跑偶发 EBUSY，用 `--no-file-parallelism`）
- [x] 7.2 请用户重启 figma-interaction-doc-engine MCP，并确认进程启动时间晚于 dist 构建时间（进程 10-17 10:59 > dist 10-17 04:47）
- [x] 7.3 真机：渲染一份含状态行（带条件 / 只有名字）、普通规则、`####` 和配图的测试文档，检查加粗范围正确、普通规则无残留加粗（「Agent草稿」/变色龙页 `654:3648`，三条写入路径均正确，"进入战斗状态后…"未误判）
- [x] 7.4 真机：同一文档改一条普通规则为状态行、一条状态行为普通规则，走同步模式，检查字重随之更新（changes 2 条，`禁用状态`→`未解锁时按钮置灰` 整段恢复 Regular）
- [x] 7.5 `.handoff/CURRENT.md` 待办 4 标记完成，补充新增的坑（如有）
