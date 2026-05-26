## Why

v2 Markdown 当前每个 `### 语义簇` 下只能放扁平 bullet 列表，但功能复杂的簇（例如「经验条」既有"基础信息"又有"升级反馈"）的 bullet 数量经常 ≥ 8，渲染到 Figma 后说明块内长成一坨密集列表，缺乏视觉分层、降低被设计师/程序快速扫读的效率。

策划/SOP 用户希望在簇内 bullets 之上补一层**软约束的子分类小标题**：是否分组、分几组、组名叫什么，**完全由作者按内容粒度决定**——契约只负责把作者的分组意图忠实表达到 IR 与 Figma 渲染产物上。

## What Changes

- v2 Markdown 语法新增 `#### 子分类标题`：可选，出现在 `### 簇` 与该簇 bullets 之间。
- 一个簇内可有 0 个、1 个或多个 `####`；每个 `####` 后带若干 bullets，直到下一个 `####`/`###`/`##` 结束。
- IR：`Cluster.bullets: string[]` 替换为 `Cluster.groups: BulletGroup[]`，其中 `BulletGroup = { title: string | null; bullets: string[] }`。
  - **BREAKING（IR 层）**：删除 `Cluster.bullets` 字段。但 v2 Markdown 不带 `####` 时 IR 等价于"单 group + title=null + 全部 bullets"，对作者层无破坏。
- Parser：识别 `#### ` 开头的行为子分组锚点；若簇内既有 `####` 又有"游离 bullets"（`####` 之前的 bullets），游离部分进入 `title=null` 的隐式默认 group；warning 提示作者补一个分组名以保持一致。
- 渲染：Figma 1:14 模板的"说明块"在 group ≥ 2 或单 group 有 title 时插入子分类小标题文本节点；group=1 且 title=null 时与现状渲染一致（向后兼容）。
- 强校验：分组名长度 1-12 字；同一簇内 group title 不可重复。
- v2 Markdown spec 文档（`packages/skill/references/markdown-v2-spec.md`）首次落盘到 `openspec/specs/` 主 spec 库（此前仅以 skill reference 形式存在）。
- `examples/玩家等级系统/玩家等级系统_交互文档.md` 的「经验条」簇按"基础信息 / 升级反馈"两个分组改写，作为示例。

## Capabilities

### New Capabilities
- `markdown-v2-contract`: v2 Markdown 契约——header / overview / sections / clusters / bullets 的语法、强校验、软警告规则；本 change 同时为该 spec 引入"簇内子分类小标题（####）"的语法与校验条目。
- `figma-template-1-14-rendering`: 把已校验的 v2 IR 写入 Figma 1:14 模板的渲染规则——节点克隆、配图占位、坐标安全、说明块布局；本 change 为其新增"说明块内子分类标题渲染"的渲染要求。

### Modified Capabilities
（无——上述两个 spec 在主 spec 库中尚未首次落盘，本 change 走 New Capabilities 同时建立这两个 spec 并把本次新增条目写入。）

## Impact

- **代码**
  - `packages/engine/src/v2/ir.ts`：`Cluster` 类型改 `bullets` → `groups`。
  - `packages/engine/src/v2/parser.ts`：新增 `####` 行识别；簇解析子状态机扩展。
  - `packages/engine/src/v2/render.ts`：`fillCluster` 增加子分组迭代；说明块克隆时对 group 分别处理小标题。
  - `packages/engine/tests/parser.spec.ts` + 新增 `tests/fixtures/buzhong-with-subgroups.md`：覆盖"无 ####/单 ####/多 ####/错位 ####" 四种用例。
- **下游引用**
  - `packages/mcp-adapter` 的渲染调用通路无变化（adapter 不直接读 `bullets`）。
- **文档**
  - `packages/skill/references/markdown-v2-spec.md` 同步更新（保持 skill 与 spec 一致）。
  - `examples/玩家等级系统/玩家等级系统_交互文档.md` 改写「经验条」簇（验证可读性提升）。
- **不影响**
  - 现有不含 `####` 的 v2 Markdown 文档无需任何改动即可通过新 parser（向后兼容）。
  - figma-console MCP / Figma 模板本身无需修改。
