## 1. 契约文档

- [x] 1.1 新增 `packages/skill/references/template-contract.md`：写清 F1–F6 铁律、8 项能力枚举与缺省值、4 部件模型、`template.json` 结构、四级查找顺序、指纹与漂移规则（内容取自 design.md D5–D9，成文给人和 agent 读）
- [x] 1.2 `packages/skill/references/template-1-14.md` 头部加一句：本文件是「模板契约 v1 的实现 #1」，能力全为缺省值
- [x] 1.3 `packages/skill/phases/phase4-figma.md` preflight 增加一步：先跑探针，`verdict != ready` 时按结论提示，不直接渲染

## 2. 契约类型与校验

- [x] 2.1 新增 `packages/figma-mcp-server/src/v2/template/schema.ts`：`TemplatePack` / `Capabilities` / `AnchorSpec` 类型 + 8 项能力的取值常量与缺省值
- [x] 2.2 新增 `parseTemplatePack(raw)`：缺字段补缺省、未知能力值报错、`schema_version` 不匹配报错；返回结构化对象或错误清单
- [x] 2.3 单测：空对象 → 全缺省；未知能力值 → 报错；`schema_version: 2` → 报错；`anchors` 缺省可接受（`tests/v2/template-pack.spec.ts`，10 例）

## 3. 配置读取扩展（不改变现有行为）

- [x] 3.1 `template-config.ts` 增加模板包读取：四级顺序（项目根 → `~/.game-interaction-sop/templates/<项目名>.json` → 全局 default → 官方 1:14）
- [x] 3.2 `template.json` 不存在 / 解析失败 → 完全回落现有行为（`fileKey` + `nodeId` 默认值），不新增错误
- [x] 3.3 单测：无模板包时解析结果与改动前逐字段一致；有模板包时 4 个 componentKey 正确读出（`tests/v2/template-pack-lookup.spec.ts`，8 例）

## 4. 探针：骨架与母版识别

- [x] 4.1 新增 `src/v2/probe/tree.ts`：把 `scanSubtree` 的扁平结果规约为轻量树，并提供 `walkStructured`（INSTANCE 视为叶子）
- [x] 4.2 顶部区识别：排除含章节的祖先节点，取短标签最多的区域 → F1
- [x] 4.3 章节识别：图形（≥1000 宽、比列宽 1.1 倍）+ 文本列成对 → F2
- [x] 4.4 簇识别：列的子节点中「≥2 非空文本 + 编号载体或短标题+内容行」→ F3 / F4
- [x] 4.5 母版发现：隐藏同形单元 → `hidden`；≥2 → `repeated`；根是 COMPONENT 且唯一 → `template`；其余 → `single` → F5 / F6
- [x] 4.6 单测（节点树 fixture，不连 Figma）：`1:14` 结构 → 全绿；`798:17608` 结构 → 全绿且母版为 `Group 2360` / 隐藏 `Frame 1244`（`tests/v2/fixtures/probe-trees.ts` + `tests/v2/probe.spec.ts`）

## 5. 探针：能力判定

- [x] 5.1 `overview`：排除章节区后，找「短标题 + 正文」成对的兄弟块 ≥2 → `two-frames`
- [x] 5.2 `clusterGroups`：簇内兄弟 TEXT 短标题 ≥2 → `slot-run`；1 → `inline-subtitle`；0 → `none`
- [x] 5.3 `badgeSlot`：标号父容器全是标号 → `container`；与内容混排 → `manual`
- [x] 5.4 `numberBadge`：裸 TEXT → `text`；INSTANCE 内含数字 → `instance`
- [x] 5.5 `roleAnnotation`：同父 ≥3 个 `@角色` TEXT → `component-variant`；句内 `@` → `inline-suffix`
- [x] 5.6 `figure`：簇内有 `配图` 命名组 → `named-group`；混排非文本子节点 → `first-non-text`
- [x] 5.7 `hiddenPool`：簇内隐藏节点 ≥3 → `reuse`；否则 `ignore`
- [x] 5.8 每项输出都带 `source`：`probed` / `inferred` / `default`；三来源均有单测覆盖

## 6. 探针：指纹、报告与草案

- [x] 6.1 `fingerprint`：形状特征（层级、类型序列、子节点数、名称、尺寸量级、可见性）sha256，不含文本；单测：改文案不变、插节点变化
- [x] 6.2 报告结构按 design D10 输出（`verdict` / `rules` / `masters` / `capabilities` / `gaps` / `draft` / `fingerprint` / `human`）
- [x] 6.3 `verdict` 判定按 design D11；三态互斥，单测覆盖三态
- [x] 6.4 `draft` 可直接落盘为 `template.json`（`components` 为 `null`），并有用例验证能被 `parseTemplatePack` 解析
- [x] 6.5 人读版报告（文本）：铁律逐条 ✅/❌、母版、能力清单、缺口与建议动作

## 7. MCP 工具与只读约束

- [x] 7.1 `src/v2/probe/index.ts` 导出 `probeTemplate({ fileKey?, nodeId, maxNodes?, backend })`
- [x] 7.2 `createServer.ts` 注册 `figma_probe_template`（只读工具），并更新 `server.spec.ts` 的工具清单断言
- [x] 7.3 只读保证：探针路径只用 `getNodeInfo` + `scanSubtree`；`tests/v2/probe-readonly.spec.ts` 断言零写入方法被调用

## 8. 验证

- [x] 8.1 `npm run build --prefix packages/figma-mcp-server` 通过；`npm test` 全绿（230/230，`--no-file-parallelism`）
- [x] 8.2 对 `1:14` 真机核对：章节 = `界面说明1`（图形 `rec组`、列 `Text`、2 簇），编号 `text`，职能 28 个 `@角色` 成组 → `component-variant`，句内 0 → 结论 `ready`、能力全缺省
- [x] 8.3 对 `798:17608` 真机核对：2 个章节（`Group 2360` 6 簇含 1 隐藏 / `Group 2361` 2 簇含 1 隐藏），编号 `instance`，句内 `@` 38 处、成组 0 → `inline-suffix`；缺口为图上标号无容器（`badgeSlot=manual`）→ 结论 `ready`
- [x] 8.4 对 `796:12489`（14110 节点）真机跑 `figma_probe_template`：`ready`，3 章节 / 15 簇，章节母版 `Group 2363`、簇母版隐藏 `Frame 1244`，能力 `none / none / manual / instance / inline-suffix / first-non-text / reuse / right`；同步扫描 17s 内完成
- [x] 8.5 探针全程只读：三次真机调用前后 `1:14` / `798:17608` / `796:12489` 的结构指纹完全一致（`sha256:216c…` / `8a37…` / `c47d…`），画布无改动

> 说明：8.2–8.4 是在真机上用与 `detect.ts` 同一套规则重放结构判定（`figma_execute` 只读脚本）。`figma_probe_template` 这个 MCP 工具本身需要重启 MCP server 才会出现在工具列表里，端到端调用留到重启后自检。
