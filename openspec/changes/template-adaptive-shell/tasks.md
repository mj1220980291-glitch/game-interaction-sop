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

## 4. 章节 / 顶部结构（真机验收暴露后补做）

- [x] 4.1 章节改成 `左列(标题 + 舞台) | 说明栏`，根与左列 HUG 自动布局
- [x] 4.2 `气泡` 克隆进舞台（不再挂在章节根上）
- [x] 4.3 主图占位带灰底 + 虚线，空壳也能看出是占位
- [x] 4.4 顶部合成：`Banner + 标题行 + 文档说明`（`staged.topBanner` / `topIntro`）
- [x] 4.5 顶部只清「值」（`/人名`、`-状态`）与 `文档说明` 旧链接，标签保留
- [x] 4.6 簇里 ≥400×300 的原稿截图换成同尺寸 `配图占位`
- [x] 4.7 归一化不再把 `气泡`（更宽）/ `舞台`（等宽）改名成 `主图占位`
- [x] 4.8 渲染：标号按主图实际矩形等比定位；编号在实例内部时按结构写入
- [x] 4.9 真机踩坑修正：实例子层 id 不 resolve、绝对定位顺序、`resize` 翻 FIXED
- [x] 4.10 `npm run build` + `npm test`（369 全绿）

## 5. 真机（已完成，2026-10-28）

- [x] 5.1 重编蛋仔（参数见 HANDOFF，注意 `badgeSlot` 传 `manual` 才会补气泡）
- [x] 5.2 发布 → 沙盒 `Assets → Libraries` 关开 → import 冒烟 → 回填 key
- [x] 5.3 配置里 `badgeSlot` 写 `container`
- [x] 5.4 重渲染 + **截图逐项目视**（底色 / 占位 / 标号 / 章节标题 / 重叠）
- [x] 5.5 清理旧零件变体集，再发布一次

## 6. 改进（已完成）

- [x] 6.1 蛋仔形状写进 fixture 矩阵（`tests/v2/fixtures/danzi-shapes.ts` + `danzi-shapes.spec.ts`）
- [x] 6.2 渲染后固定截图（`render` 默认返回整篇 PNG）+ 发布后 import 假死自动重试
- [x] 6.3 免手动重启：父进程常驻 + 可替换 worker（`src/server/index.ts` / `worker.ts` / `workerLoop.ts`）

