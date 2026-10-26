# 交接说明（2026-10-26）

## 一句话现状

「模板契约 + 只读探针」已实现、真机验收、归档。引擎现在能体检任意项目模板并回答「能不能接、缺什么、按哪套能力渲染」，**但还不能编译出可渲染模板**——那是下一个变更。

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

## 下一个变更：`template-compile-to-library`

把探针草案变成可用模板：

```
读项目模板 + 2~3 份文档样本
  → 在我们自己的模板库文件里生成 4 个原子组件（克隆 + 打锚点）
  → 发布 → 取 4 个 componentKey
  → 写项目模板包 .interaction-sop/template.json（components 回填）
```

**前置未知项**（要先定）：

1. 模板库文件归谁、放哪个 Figma 文件；发布库需要团队/组织权限
2. 嵌套实例依赖：`标签`（职能图例）/`num`（三角）本身是别的组件实例，发布后源组件不可访问会变占位
3. 字体：`U5Font` 等项目字体要先装，否则字重回退
4. 锚点方式：plugin data 优先，改名/不可见 FRAME 兜底（探针阶段只读，未打标）

之后才是第三个变更 `engine-multi-part-template-render`（渲染改为 4 部件 import→detach→append，落地 8 项能力，含 `clusterGroups` / `hiddenPool` 两个填充算法的函数级分叉）。

---

## 已知遗留

- **项目名更正（2026-10-27）**：`796:12489` / `798:17608` 属于 **蛋仔派对**，归档变更里写的「惊魂寻宝队」是错的。归档文件不改（当作历史），现行文档与库内组件命名已改为 `蛋仔派对 / 顶部|章节|簇|结尾`、`蛋仔派对 / 零件 / …`。
- **端口漂移（2026-10-26 踩过）**：连续重启 MCP 时旧进程不退、继续占 9223–9232，新进程一路上漂（9229→9230…），插件只认 9223，表现是「重启后插件连不上 / 显示已连接但工具报 Cannot connect」。排查与清理命令见 `packages/figma-mcp-server/docs/INSTALL.md`「重启引擎后 Bridge『坏了』」。本次已一次性清掉 7 个僵尸进程。
- 14000 节点文档扫描约 17s；超时自动降级到 1/4 预算并把结论降为 `needs-anchor`（不会误判 non-conformant）
- `badgeSlot=manual` 的项目，图上标号仍需人工摆位（`796` / `798` 都是）
- 一项目一套模板；多套留到之后
- `md-contract.md` 的生成逻辑未做（契约里只定义了字段集与「模板结构为准」原则）
- `796` 的 `1:14` 判定里 `#Name` 在 `#Name/界面名称` 框内、主图在 `rec组` 内，fixture 已按真机结构重写，勿按旧文档假设改回
