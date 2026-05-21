## 1. IR 与类型层

- [x] 1.1 在 `packages/engine/src/v2/ir.ts` 新增 `BulletGroup` 类型 `{ title: string | null; bullets: string[] }`，`Cluster` 字段 `bullets: string[]` 改为 `groups: BulletGroup[]`
- [x] 1.2 更新所有内部引用 `cluster.bullets` 的位置（render.ts / 测试 fixtures），使其遍历 `groups[].bullets`
- [x] 1.3 导出 `BulletGroup` 与 `Cluster` 类型至 `v2/index.ts`

## 2. Parser 升级

- [x] 2.1 在 `parser.ts` 新增错误码 `H_H4_ORPHAN`、`H_GROUP_TITLE_LEN_OVERFLOW`、`H_GROUP_TITLE_DUPLICATE` 与软警告 `W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS`
- [x] 2.2 修改簇解析子状态机：在 `### + @role` 状态后允许 `####` 行作为新分组锚点；累积 bullets 时归入"当前 group"
- [x] 2.3 簇解析结束时若没有任何 `####`，自动包出 1 个 `{title:null, bullets:[…]}` 默认 group
- [x] 2.4 簇解析结束时若 `####` 之前出现过 bullets，emit `W3` 警告并把这部分 bullets 作为 `title=null` 默认 group 放在 groups[0]
- [x] 2.5 校验 `####` 标题长度（中文 ≤ 12 / ASCII ≤ 24）与同簇内重名
- [x] 2.6 H4 出现在 `## ↔ ###` 之间或文档其他位置时报 `H_H4_ORPHAN`

## 3. 渲染层升级（Phase 1 备胎 — 拍平策略）

- [x] 3.1 render.ts 新增 `flattenGroups` 辅助函数：具名 group 前插 `▸ <title>` 行，扁平输出给现有单块渲染逻辑
- [ ] 3.2 ~~深度渲染：每 group 克隆一次说明块~~ → 拆下一个 change `v2-render-subgroup-headings-deeply`
- [ ] 3.3 ~~小标题 TEXT 节点克隆~~ → 下一个 change
- [ ] 3.4 ~~多 group 场景角色 TEXT keep-first~~ → 下一个 change
- [ ] 3.5 ~~多 group 场景配图占位~~ → 下一个 change

## 4. 测试

- [x] 4.1 在 `tests/fixtures/` 新增 `subgroup-basic.md`（单簇 2 group）和 `subgroup-mixed.md`（混合 null+title + 游离 bullets）
- [x] 4.2 `parser.spec.ts` 新增 8 个用例：单簇 0/1/2/3 group 各一个；超长标题 / 重名 / 错位 H4 / 游离 bullets warning 各一个
- [ ] 4.3 ~~渲染调用次数 spy~~ → 下一个 change（深度渲染后再写）

## 5. 文档与示例同步

- [x] 5.1 更新 `packages/skill/references/markdown-v2-spec.md`：新增"### 簇内子分类小标题（####）"章节，含示例和强校验表
- [x] 5.2 更新 `packages/skill/phases/phase2-markdown.md`：在写 Markdown 的指引里加一句"bullets ≥ 6 时考虑用 #### 分组"
- [x] 5.3 改写 `examples/玩家等级系统/玩家等级系统_交互文档.md` 的「经验条」簇为 2 group（`基础信息` / `升级反馈`）
- [x] 5.4 重跑 `npm run test-parse` 确认新 example 的 IR 含正确 group 结构：groups=2(基础信息/升级反馈)  bullets=10  hasImg=true ✓

## 6. 重打 release

- [x] 6.1 `npm run build` + `npm run test`（24+12=36 用例全绿）
- [x] 6.2 `npm run release` 重打 zip
- [x] 6.3 端到端冒烟通过
