## 1. Schema

- [x] 1.1 `template/schema.ts`：新增 `TemplateGeometry` 类型与 `geometry` 字段解析（缺省/非法逐项丢弃 + warning）
- [x] 1.2 单测：带 geometry / 无 geometry / 单字段非法三种解析结果（`tests/v2/template-geometry.spec.ts`）

## 2. 编译期采集

- [x] 2.1 新增 `compile/geometry.ts`：`captureGeometry(backend, { chapterComponentId, sourceRootId, sourceBackend })`
- [x] 2.2 `chapterWidth` / `mainImage` / `placeholder` 从章节的 `主图占位` 采
- [x] 2.3 `bubbleGrid`（比例值）/ `badgeSize` 从 `气泡` 的 `标号/N`、`标号/母版` 采；量 staged 原稿（产物里标号已被收口成母版）
- [x] 2.4 `docBackground` 从源模板根节点填充采，调用方显式传入优先
- [x] 2.5 中间用 `geometry.json` sidecar 传给 verify 阶段写 pack；采集失败记 gap 不失败
- [x] 2.6 单测覆盖解析与回落；采集本身在真机验过（见 4.x）

## 3. 渲染期使用

- [x] 3.1 部件间距用 `geometry.rootGap`（缺省 0）
- [x] 3.2 章节宽度兜底用 `geometry.chapterWidth`；标号点位用 `bubbleGrid` 比例 × 主图实际尺寸
- [x] 3.3 占位灰阶：有 `geometry.placeholder` 直接用
- [x] 3.4 网格不足时按最后一格步长延续
- [x] 3.5 没放图的 `配图` 槽也刷成占位色（原本编译产物里的浅灰在深色稿上就是白板）

## 4. 真机与文档

- [x] 4.1 官方1.14：底色 `#1E1E1E`、主图/配图占位 `#454545`、标号落模板点位 (761,164)/(636,267)
- [ ] 4.2 蛋仔：模板里没有可量的标号点位（原稿被收口成只剩母版），网格仍是默认；其余项可采
- [ ] 4.3 渲染前后对比截图（截图工具本轮反复超时，用节点实测值代替）
- [ ] 4.4 更新 HANDOFF
