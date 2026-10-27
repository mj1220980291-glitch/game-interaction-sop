# Tasks

> 约定：每组结束跑 `npm run build` + `npm test`，全绿再进下一组。真机动作统一放最后一组。

## 1. 后端能力

- [x] 1.1 `NodeInfo` 增加 `layoutMode`；`serNode` / `mapNode` 透传
- [x] 1.2 `FigmaBackend` 增加 `setAutoLayout`（收 `itemSpacing` / `padding` / `hugHeight` / `absoluteChildIds`）
- [x] 1.3 `figmaConsoleBackend` 实现：先设绝对定位，再开 `layoutMode`，宽度固定、高度 HUG

## 2. 编译期自适应外壳

- [x] 2.1 新增 `compile/adaptive-layout.ts`：章节 / 簇两种外壳
- [x] 2.2 章节：`HORIZONTAL` + `paddingTop = min(图区.y, 说明栏.y)` + `itemSpacing = 说明栏.x − 图区右边`，其余子级绝对定位
- [x] 2.3 簇：单子级 → `VERTICAL` + `paddingTop = 子级.y`
- [x] 2.4 幂等：已是自动布局直接跳过；推不出参数记缺口、零写入
- [x] 2.5 接入 `compile/index.ts`（空壳化之后），报告新增 `adaptive`
- [x] 2.6 单测：蛋仔几何算出 gap 77 / padTop 786 / 气泡绝对定位；顺序反了 / 缺槽位 / 后端不支持 → 缺口
- [x] 2.7 跑 `npm run build` + `npm test`

## 3. 渲染期接上自动布局

- [x] 3.1 根帧建成 `VERTICAL` 自动布局（`itemSpacing = PARTS_GAP`），`layout()` 只负责撑宽
- [x] 3.2 `chapter.fit` 在部件 `layoutMode ≠ NONE` 时跳过
- [x] 3.3 后端没有 `setAutoLayout` → 回落原手工排版（零回归）
- [x] 3.4 单测：根帧设了自动布局；带 HUG 链的章节不被 resize；不带时仍兜住；无能力时回落
- [x] 3.5 跑 `npm run build` + `npm test`

## 4. 真机

- [ ] 4.1 重编蛋仔（确认报告 `adaptive` 里有章节 HORIZONTAL / 簇 VERTICAL）
- [ ] 4.2 发布 → 沙盒 Assets→Libraries 关开一次 → import 冒烟 → 回填 key
- [ ] 4.3 重渲染蛋仔样例：章节高度 = 内容高、根帧高 = 各部件和、无重叠、标号在位
- [ ] 4.4 回填 `蛋仔派对.json`，清理库里被替换的旧组件
