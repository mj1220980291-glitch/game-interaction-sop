## 1. Schema

- [ ] 1.1 `template/schema.ts`：新增 `TemplateGeometry` 类型与 `geometry` 字段解析（缺省/非法逐项丢弃 + warning）
- [ ] 1.2 单测：带 geometry / 无 geometry / 单字段非法三种解析结果

## 2. 编译期采集

- [ ] 2.1 新增 `compile/geometry.ts`：`captureGeometry(backend, { chapterComponentId, sourceRootId })`
- [ ] 2.2 `chapterWidth` / `mainImage` / `placeholder` 从章节组件的 `主图占位` 采
- [ ] 2.3 `bubbleGrid`（比例值）/ `badgeSize` 从章节组件 `气泡` 的 `标号/N`、`标号/母版` 采
- [ ] 2.4 `docBackground` 从源模板根节点填充采，调用方显式传入优先
- [ ] 2.5 `backfill.buildTemplatePack` 写入 `geometry`；采集失败记 gap 不失败
- [ ] 2.6 单测：深色源 → `docBackground`；网格 → 比例值；无气泡 → 记 gap

## 3. 渲染期使用

- [ ] 3.1 `parts/index.ts`：部件间距用 `geometry.rootGap`（缺省 0）
- [ ] 3.2 `parts/geometry.ts`：章节宽度兜底用 `geometry.chapterWidth`；标号点位用 `geometry.bubbleGrid` 比例 × 主图实际尺寸；母版尺寸回落 `geometry.badgeSize`
- [ ] 3.3 占位灰阶：有 `geometry.placeholder` 直接用，否则走现有亮度逻辑
- [ ] 3.4 网格不足时按最后一格间距延续（不重叠）
- [ ] 3.5 单测：默认回落不回归；给网格后按比例摆位

## 4. 真机与文档

- [ ] 4.1 重编蛋仔：落到 `geometry`（深底 `#232429`、主图 1200×719、网格 3 点）
- [ ] 4.2 重编官方1.14：`docBackground` 采到深色，渲染不再白底白字
- [ ] 4.3 对比渲染前后：底色、占位、标号分布
- [ ] 4.4 更新 HANDOFF
