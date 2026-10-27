# 交接说明（2026-10-26）

## 一句话现状

两个变更已完成并归档：**模板契约 + 只读探针**、**编译到组件库**。引擎现在能把任意 `ready` 的项目模板编译成我们库里 4 个原子组件并登记 key；**但渲染还走旧路径**（整份克隆），多部件渲染是下一个变更。

已真机接入两套模板：`~/.game-interaction-sop/templates/蛋仔派对.json`、`官方1.14.json`。

## 关键地址（换对话后直接可用）

| 用途 | 值 |
|---|---|
| 源项目文件 | `Agent草稿` / `UYCJok3MXTWITMfeJSqEF6` |
| 模板库 | `交互SOP模板库` / `jQf7zj33pzOGsGKO4d73OO`；页：`部件` `0:1` · `零件` `3:9` · `_staging` `3:10` |
| 校验沙盒 | `SOP 校验沙盒` / `0eoR7aPlpzIva8IdWATWkL`（verify 只在这里跑） |
| 模板节点 | `796:12489` 局内相关交互（蛋仔派对）· `1:14` 模板（官方1.14） |
| 已发布组件 | 蛋仔派对 4 个 + 零件 3 个；官方1.14 3 个（无结尾） |
| 已登记配置 | `~/.game-interaction-sop/templates/{蛋仔派对,官方1.14}.json` |
| Bridge 端口 | 首选 `9223`；连不上先查僵尸进程（见下） |

当前工作区干净，最新提交 `ba44bbc`。

---

## 已完成

变更 `template-contract-and-probe` → 归档在
`openspec/changes/archive/2026-10-26-template-contract-and-probe/`

主 spec 已同步：

```
openspec/specs/template-contract/spec.md   6 条需求（新）
openspec/specs/template-probe/spec.md      6 条需求（新）
openspec/specs/engine-mcp-server/spec.md   +2 条需求（探针工具）
```

测试：`packages/figma-mcp-server` 231/231 通过；`openspec validate --all --strict` 11/11。

---

## 代码落点

```
packages/figma-mcp-server/src/v2/template/schema.ts     契约类型 + 8 能力枚举 + parseTemplatePack
packages/figma-mcp-server/src/v2/template-config.ts     四级查找 + loadTemplatePack（新增）
packages/figma-mcp-server/src/v2/probe/tree.ts          规约树 + walkStructured（INSTANCE 当叶子）
packages/figma-mcp-server/src/v2/probe/detect.ts        章节/簇/母版/能力判定（核心）
packages/figma-mcp-server/src/v2/probe/fingerprint.ts   形状指纹（不含文本）
packages/figma-mcp-server/src/v2/probe/index.ts         probeTemplate / probeFromTree / 报告
packages/figma-mcp-server/src/server/createServer.ts    注册 figma_probe_template
packages/figma-mcp-server/src/server/figmaConsoleBackend.ts  serNode 改同步 + characters 截 400
packages/skill/references/template-contract.md          契约权威文档（人/agent 读）
packages/skill/references/template-1-14.md              声明为「契约实现 #1」
packages/skill/phases/phase4-figma.md                   preflight 增加探针步骤
```

测试：

```
tests/v2/probe.spec.ts              20 例（两套真机结构 fixture + 三态 + 指纹 + badge 边界）
tests/v2/probe-readonly.spec.ts      3 例（零写入）
tests/v2/probe-tool.spec.ts          5 例（MCP 工具注册/入参/草案可落盘）
tests/v2/template-pack.spec.ts      10 例
tests/v2/template-pack-lookup.spec.ts 8 例
tests/v2/fixtures/probe-trees.ts   真机结构快照（1:14 / 798:17608）
```

---

## 契约要点（记住这四条就够）

```
1. 4 个原子部件：top / chapter / cluster / footer，各一个组件库 key
   （不用组件集+变体名，避免运行时"找不到变体"）
2. 8 项能力枚举，缺省值 = 官方 1:14：
   overview / clusterGroups / badgeSlot / numberBadge /
   roleAnnotation / figure / hiddenPool / column
3. 样式不进配置：字体/颜色/间距/标号形状靠克隆继承
4. 结构差异才进契约；新差异不能表达就拒绝，不临时加能力
```

类型 / 判定细则见 `openspec/changes/archive/2026-10-26-template-contract-and-probe/design.md` 的 **D12**（5 条真机判据）。

---

## 真机验收结果（可直接复跑）

```
figma_probe_template({nodeId:"1:14"})       ready · 1 章节 / 2 簇 · 能力全缺省
figma_probe_template({nodeId:"798:17608"})  ready · 2 章节 / 8 簇 ·
    none/none/manual/instance/inline-suffix/first-non-text/reuse/right
figma_probe_template({nodeId:"796:12489"})  ready · 3 章节 / 15 簇 · 14110 节点 · 17s
figma_probe_template({nodeId:"999:999"})    code=V2_PROBE_NODE_NOT_FOUND
```

指纹（证明只读）：`1:14 → 216c7c73…` / `798 → 8a371ee4…` / `796 → c47d41e9…`

---

## 未提交

工作区有未提交改动（12 个修改 + 12 个新增），**没有 commit**。换对话后第一件事可能需要：

```
git add -A && git commit -m "feat(template): contract v1 + read-only template probe"
```

---

## 下一个变更：`engine-multi-part-template-render`

渲染改成「导入 4 部件 → detach → append」，落地 8 项能力（含 `clusterGroups` / `hiddenPool` 两个填充算法的函数级分叉）。

开工前必须处理的三条已知债务：

1. **部件带着原稿内容**：编译是克隆母版，章节部件里仍有该项目当时的文案、截图实例与全部簇，渲染填充前必须清空
2. **标号摆位**：容器已统一（`badgeSlot=container`），但标号落点没算，渲染要做
3. **`md-contract.md`** 仍未生成（契约里只定义字段集与「模板结构为准」）

编译侧遗留（不阻塞渲染）：

- `1:14` 的部件仍依赖草稿里的组件（该模板无可收编的实例），所以 verify 只能在沙盒里跑
- 收编独立性（删源组件后不塌）未实测，已缓办

---

## 编译阶段落点（第二个变更）

```
src/v2/compile/index.ts        compileTemplate(compile|verify) 编排；含两页自动排版
src/v2/compile/parts.ts        planParts / buildParts（克隆→变组件→可见→锚点）
src/v2/compile/intake.ts       进门检查（齐全 / 类型 / 尺寸对探针 / 标号容器）
src/v2/compile/adopt.ts        adoptNestedParts（跨部件去重、变体集重组、内容闸门）
src/v2/compile/font-normalize.ts  Noto Sans SC 三档 + 字重映射
src/v2/compile/badge-container.ts 从 1:14 气泡克隆空容器
src/v2/compile/anchor.ts       三档锚点降级 + anchors 只写降级项
src/v2/compile/verify-capabilities.ts 产物能力重算（判不出的保留源值并记缺口）
src/v2/compile/preflight.ts    四条前置校验
src/v2/compile/backfill.ts     真 import 冒烟 + template.json 组装自检
src/v2/compile/errors.ts       8 个错误码
```

后端新增能力（`figmaConsoleBackend.ts`）：`createComponentFromNode`（GROUP 先套 FRAME）、
`combineAsVariants`、`setPluginData`、`renameNode`、`readComponentKey`、`importComponentByKey`、
`normalizeFontsInSubtree`、`adoptInstances`（`getMainComponentAsync`）、`createInvisibleAnchor`、
`setNodeVisible`、`arrangePageChildren`。

SOP：`packages/skill/references/template-compile.md`。

测试 304 例，全部通过。

### 编译阶段真机验收（2026-10-27）

```
蛋仔派对 796:12489  4 部件 + 收编 标签6变体/num/-完成 + 跳过 72 个内容实例
                    发布 → verify 4 key 全取到 → 登记配置
官方1.14 1:14       进门检查 3 项尺寸全对 → 3 部件（无结尾）
                    发布 → 沙盒 verify 3 key 全取到 → 登记配置
能力                numberBadge:instance / roleAnnotation:inline-suffix /
                    clusterGroups:none 均如实保留；唯一差异 badgeSlot manual→container（预期）
源模板              preflight 指纹一致，零写入
```

踩过并已修的真机坑（都写进了代码或文档）：

1. `createComponentFromNode` 拒绝 GROUP 直转 → 先套同尺寸 FRAME
2. `mainComponent` 在 dynamic-page 下必须 `getMainComponentAsync`
3. 隐藏的簇母版克隆后要强制可见，否则整簇隐形
4. 图层还嵌在 COMPONENT 里时不能转组件 → 先挪到零件页
5. 部件里看不到 `overview` / `roleAnnotation` 时不能判 `none`，要保留源值
6. 冒烟在源文件里 import 会因依赖成环超时 → 改沙盒
7. 项目名含 `:` 无法做配置文件名 → 命名闸门

---

## 已知遗留

- **项目名更正（2026-10-27）**：`796:12489` / `798:17608` 属于 **蛋仔派对**，归档变更里写的「惊魂寻宝队」是错的。归档文件不改（当作历史），现行文档与库内组件命名已改为 `蛋仔派对 / 顶部|章节|簇|结尾`、`蛋仔派对 / 零件 / …`。
- **端口漂移（2026-10-26 踩过）**：连续重启 MCP 时旧进程不退、继续占 9223–9232，新进程一路上漂（9229→9230…），插件只认 9223，表现是「重启后插件连不上 / 显示已连接但工具报 Cannot connect」。排查与清理命令见 `packages/figma-mcp-server/docs/INSTALL.md`「重启引擎后 Bridge『坏了』」。本次已一次性清掉 7 个僵尸进程。
- 14000 节点文档扫描约 17s；超时自动降级到 1/4 预算并把结论降为 `needs-anchor`（不会误判 non-conformant）
- `badgeSlot=manual` 的项目，图上标号仍需人工摆位（`796` / `798` 都是）
- 一项目一套模板；多套留到之后
- `md-contract.md` 的生成逻辑未做（契约里只定义了字段集与「模板结构为准」原则）
- `796` 的 `1:14` 判定里 `#Name` 在 `#Name/界面名称` 框内、主图在 `rec组` 内，fixture 已按真机结构重写，勿按旧文档假设改回
