## Context

v2 Markdown 契约自上线以来在 15+ 个真实交互文档中沉淀，被验证可以稳定写入 Figma 1:14 模板。但其"扁平 bullet"模型在功能复杂的簇里暴露出可读性瓶颈：

- `examples/玩家等级系统/玩家等级系统_交互文档.md` 的「经验条」簇有 11 条 bullets，混合了"基础布局/动效表现/异常态"三种语义；写入 Figma 后说明块是一坨密集列表，扫读成本高。
- 策划/设计同事在 Phase 2 评审 Markdown 时也反馈"想分小段落"，但当前契约只能用斜体或加粗 inline 强调，没有结构化的分组单元。

需求方希望在簇内 bullets 之上补一层"软约束"的子分类小标题：是否分组、分几组、组名叫什么，**完全由作者按内容粒度决定**。引擎只负责把作者的分组意图忠实表达到 IR 与 Figma。

约束：

- 向后兼容：现有 N 份不带 `####` 的 v2 Markdown 必须零改动通过新 parser，IR 等价。
- 渲染降级：若 Figma 模板的"说明块"原始结构没有为子小标题预留位，渲染需要自己克隆/插入新文本节点，且不能破坏现有的角色 TEXT 删除、配图占位识别等逻辑。
- 强校验最小化：分组本质是"软"约束，引擎只校验"显然写错"的情况（重复名 / 名字超长），不去判断"这个簇该不该分组"。

## Goals / Non-Goals

**Goals:**

- v2 Markdown 新增 `#### ` 行作为簇内子分类锚点，语义清晰、可扩展。
- IR 模型从扁平 `bullets` 升级为 `groups`，且空 group + null title 的退化形式与现状语义一致。
- Parser 对"游离 bullets + 后置 ####"等错位写法给出 W 级 warning（不阻塞），引导作者写整齐。
- 渲染：说明块按 group 数量动态克隆/插入子小标题文本节点，兼容现有 1:14 模板。
- examples 案例使用新语法，作为活文档示例。

**Non-Goals:**

- 不引入嵌套子分组（`#####`）——一层就够，二层往下会变成"小型子文档"，超出说明块设计意图。
- 不为子分组单独配图——配图仍按"簇粒度"在 bullets 里以 `配图：…` 标记，不下沉到 group 粒度。
- 不强制分组——作者觉得 6 个 bullets 不需要分组就不分。

## Decisions

### D1：用 `####` 而非 `**加粗**`/`---`/列表嵌套

**选择**：在簇内 bullets 之上用 `#### 子标题` 行作为分组锚点。

**为什么不是别的方案**：

| 候选 | 原因否决 |
|---|---|
| `**子分类**：` 加粗行 | 解析靠"行尾冒号"过于脆弱；和 bullets 内的加粗强调混淆。 |
| `--- 子分类 ---` 横线包裹 | 非标准 Markdown，Figma 的 Markdown 预览（如有）不识别。 |
| 列表嵌套 `- 基础信息\n  - …` | 视觉上看起来是分组，但 IR 还是扁平 bullets，并未改变模型。 |
| `#### 子标题` | 标准 Markdown heading，和 H1/H2/H3 是同源语法，parser 状态机扩展自然。 |

H4 的语义上也"配得上"——H1 是文档标题，H2 是章，H3 是簇，H4 顺势是"簇内分组"，层级一致。

### D2：IR 字段命名 `groups: BulletGroup[]` 而非 `subgroups`

**选择**：

```ts
interface Cluster {
  // ...
  groups: BulletGroup[];   // 至少 1 个；若作者未写 ####，自动包成 1 个 title=null group
}
interface BulletGroup {
  title: string | null;    // null = 隐式默认 group
  bullets: string[];
}
```

**为什么不是 `subgroups`**：从作者视角，"簇里的分组"本身就是一级语义；prefix `sub-` 暗示存在 `groups` 上位概念，反而增加心智负担。

**为什么是数组而不是 Map**：作者在 Markdown 里的分组**有顺序**（"基础信息"在前、"升级反馈"在后），Map 会丢顺序。

### D3：游离 bullets 进入 title=null 的隐式 default group

```markdown
### 经验条
@程序 @GUI

- 这条是游离 bullet
- 这条也是

#### 升级反馈
- 这条进 升级反馈
```

**parse 结果**：

```js
{
  groups: [
    { title: null, bullets: ['这条是游离 bullet', '这条也是'] },
    { title: '升级反馈', bullets: ['这条进 升级反馈'] }
  ]
}
```

**为什么不直接报错**：分组本质是软约束，作者写到一半改主意分组很常见，强制全分组反而不友好。但 parser **emit warning** `W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`，提示作者要么全分组、要么全不分。

### D4：渲染策略——按 group 数量做决策

| group 数量 | title 情况 | 渲染策略 |
|---|---|---|
| 1 | null | **完全等同现状**：说明块克隆 1 次，bullets 平铺，无小标题文本（向后兼容关键路径）。 |
| 1 | 非 null | 说明块克隆 1 次，在 bullets 之前插入 1 行小标题文本。 |
| ≥ 2 | 全有 title | 每个 group 各克隆 1 个说明块，每块顶部插小标题，bullets 各自平铺。 |
| ≥ 2 | 含 1 个 title=null | 默认 group 渲染时同 1+null 路径（无标题前缀），其余 group 各带标题；保持视觉一致。 |

**克隆细节**：1:14 模板的"说明块"原本是 `子标号 + bullets 文本框 + 角色标签 FRAME` 三件套。新增小标题文本节点：克隆"子标号"对应位置的 TEXT（已知字号合适），改 characters，定位在 bullets 文本框之上 4px。

**坐标安全**：插入新节点后调用 Phase 4 的 `placeBubbleInFrame` 复用逻辑——FRAME-local 坐标，避免 Bug 5 的 GROUP-bbox 爆炸。

### D5：spec 首次成文同步落 `openspec/specs/`

之前 `markdown-v2-spec.md` 只在 skill references 里"以教程口吻"存在，缺一份"以规范口吻"的主 spec。本 change 借此机会落盘，避免后续 change 反复回填。两份文件**强一致**：skill 里那份是面向 AI agent 的口语化版本，主 spec 是规范化版本，两者由 archive 流程同步。

## Risks / Trade-offs

- **R1：现存 v2 Markdown 隐式包成 1-group 后回滚有迁移成本**
  - 缓解：IR 字段做了向后兼容（`Cluster.bullets` 删除前留 1 个版本的 `get bullets() {…}` 兼容 getter），下游若有外部消费方（暂无）有缓冲期。
- **R2：渲染对说明块克隆 ≥ 2 次会触发 GROUP-bbox 风险**
  - 缓解：复用现有 `placeBubbleInFrame` + `cloneNodeSafe`；新写一个 vitest 用例覆盖"3 个子分组的说明块"渲染断言。
- **R3：分组名超长破坏 Figma 单行布局**
  - 缓解：硬校验 `H_GROUP_TITLE_LEN_OVERFLOW`（>12 中文字 / >24 英文字符），parser 阶段拦截，不让烂数据进 Figma。
- **R4：作者把 #### 用错位置（写在 ## 与 ### 之间）**
  - 缓解：parser 状态机里 `####` 只在 `### + @role + (bullets|####)` 的状态接受；其他位置一律报 `H_H4_ORPHAN`（hard error）。

## Open Questions

- **Q1**：是否提供"自动分组建议"的 lint 工具（看到 ≥ 8 个 bullets 时提示作者"考虑分组"）？暂列为后续 change，本次不做。
- **Q2**：渲染时小标题文本的字号用模板里"子标号"同字号（约 14px），还是单独定义（如 16px）？暂沿用子标号字号（最小变动），实际跑过 examples 后若设计同事反馈不够突出再调。
