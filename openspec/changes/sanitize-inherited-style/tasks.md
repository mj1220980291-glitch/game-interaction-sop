## 1. 后端能力确认

- [x] 1.1 `setNodePaint({ stroke })` 只能设不能清 → 新增 `clearStrokes(nodeIds)`（`figma-client.ts` 可选能力 + `figmaConsoleBackend.ts` 实现，连 `dashPattern` 一起清）
- [x] 1.2 `setMultipleTextContents` 已是一条 exec 写多条文本 → 直接扩参数 `align` / `autoResize`，不新增入口
- [x] 1.3 后端透传：`TextWriteResult` 增加 `alignNormalized`（仅「模板原本是别的对齐」才计数）

## 2. 正文样式归一化

- [x] 2.1 parts 路径正文写入带 `align: 'LEFT'` + `autoResize: 'HEIGHT'`（经 `fillCluster` → `appendBulletsInOrder`）
- [x] 2.2 legacy 平铺路径 `fillGroupSlots`（`render.ts:1488`）同规则
- [x] 2.3 聚合告警 `W_TEXT_ALIGN_NORMALIZED`（一条，带条数）
- [x] 2.4 只给正文层加参数；标题 / 标号 / 装饰层不受影响（`fillCluster` 只对 rule 条目加）

## 3. 置图清描边

- [x] 3.1 parts 主图填图后 `clearStrokes([mainImage.id])`
- [x] 3.2 legacy 主图填图后同样清；未填图的槽保留虚线占位
- [ ] 3.3 清描边失败降级为 `W_FILL_STROKE_RESIDUAL`（当前直接抛出，失败会让渲染报错——待补）
- [x] 3.4 配图槽填图本就由后端 `fillFigurePlaceholder` 清 `strokes`；同步 `fills` 批次复用同一后端调用

## 4. 顺序与几何

- [x] 4.1 parts 路径的版面重算 `layout()` 在章节填充之后，天然在样式归一化之后
- [ ] 4.2 `HEIGHT` 自适应后章节总高与条目换行的断言（需真机或更细的 mock 高度模型）

## 5. 回归与真机

- [x] 5.1 单测：CENTER 模板 → 全 LEFT；只报一条告警；本来 LEFT 不告警
- [x] 5.2 单测：主图填图触发 `clearStrokes`；不填图不触发
- [x] 5.3 `npm run build && npm test` 全绿（63 files / 508 tests）；`openspec validate --strict` 通过
- [x] 5.4 真机 M1 全量渲染：`正文/规则` 无 CENTER、`主图占位` 无虚线，手工修补从 108 项降为 0

## 6. 文档

- [x] 6.1 `packages/skill/references/template-1-14.md` 补「归一化清单」表
- [x] 6.2 `引擎问题反馈.md` 中 P1-6 / P1-7 标注对应 change 名（已在小节标题下标注）
