## ADDED Requirements

### Requirement: 模板包记录几何与色彩

模板包 SHALL 支持可选的 `geometry` 段，字段与含义：

| 字段 | 类型 | 含义 |
|---|---|---|
| `docBackground` | `#rrggbb` | 文档底色 |
| `chapterWidth` | number | 章节宽度（模板身份，跨模板不同） |
| `mainImage` | `{width,height}` | 主图占位尺寸 |
| `placeholder` | `{fill,stroke}` | 主图占位填充与描边 |
| `bubbleGrid` | `Array<{x,y}>` | 标号点位，**按主图比例存（0–1）** |
| `badgeSize` | `{width,height}` | 标号母版尺寸 |
| `rootGap` | number | 部件之间的间距 |
| `sectionShell` | `Array<{padding:{top,right,bottom,left}, fill?}>` | 章节外面的「壳」链（外 → 内）：模板的黑色边距与章节卡片底色由这几层的 padding 与填充叠加而成 |

任意字段缺省 SHALL 视为「用渲染期的默认值」，SHALL NOT 视为错误。

#### Scenario: 老包没有 geometry

- **WHEN** 读取一个不含 `geometry` 的模板包
- **THEN** 解析成功，`geometry` 为空；渲染行为与引入该字段前一致

#### Scenario: 非法 geometry 不致命

- **WHEN** `geometry.bubbleGrid` 里混入非数字坐标
- **THEN** 该字段被丢弃并记 warning，包的其余部分照常可用

### Requirement: 编译期实测几何

编译（`phase=compile`）SHALL 从**产物部件**实测几何并写进 pack：

- `chapterWidth` / `mainImage` / `placeholder`：取章节组件的 `主图占位`
- `bubbleGrid` / `badgeSize`：取章节组件 `气泡` 内已有的 `标号/N` 与 `标号/母版`
- `docBackground`：取源模板根节点填充，调用方显式传入时以传入值为准
- `sectionShell`：从 `_staging` 上的原稿章节向上走到页面，收集每层外框
  （外 → 内）：padding 与第一个可见纯色填充。编译产出的章节只含最里层，
  这层链是黑色边距与卡片底色的唯一来源；模板根节点自身的填充属于文档底色，
  SHALL NOT 计入

单项采集失败 SHALL 记 `gap`，SHALL NOT 让编译失败。

#### Scenario: 深色模板采到底色

- **WHEN** 源模板根节点填充为 `#1A1A1A` 且调用方未传 `docBackground`
- **THEN** 写出的 pack 含 `geometry.docBackground = "#1A1A1A"`

#### Scenario: 标号网格按比例采

- **WHEN** 章节组件的 `气泡` 里有 2 个可见 `标号/N`，主图占位为 1920×1080，标号在 (960,60)、(960,180)
- **THEN** `bubbleGrid` 记录为比例值（x≈0.5、y≈0.0556 / 0.1667）

#### Scenario: 气泡缺失不阻塞

- **WHEN** 章节产物里没有 `气泡`
- **THEN** 编译仍成功，`bubbleGrid`/`badgeSize` 缺省，并记一条 gap

#### Scenario: 章节外框链按层采集

- **WHEN** `_staging` 的原稿章节祖先链为 `Comp_1`(padding 64, fill `#000000`) → `需求目标`(padding 64, fill `#161616`)
- **THEN** `geometry.sectionShell` 记录两层，外 → 内依次带各自的 padding 与 fill

#### Scenario: 只有边距没有填充的层

- **WHEN** 某层外框 padding 非零但没有纯色填充
- **THEN** 该层 SHALL 记录 padding，`fill` 缺省

#### Scenario: 没有外框的模板不记空值

- **WHEN** 原稿章节的祖先链上没有任何带 padding 或填充的框
- **THEN** `sectionShell` 缺省，并记一条 gap 说明「章节上下会贴边且卡片底色会缺」

### Requirement: 渲染期使用包内几何

渲染 SHALL 优先使用 `pack.geometry` 的值，缺省回落以下常量：`chapterWidth 2209`、`mainImage 1920×1080`、`rootGap 0`、`badgeSize 48×48`、`bubbleGrid DEFAULT_BUBBLE_GRID`、`placeholder` 按底色亮度计算的灰阶。

标号点位 SHALL 按 `bubbleGrid` 的比例乘以主图实际宽高换算；`bubbleGrid` 数量不足以覆盖簇数时，SHALL 按最后一格的间距延续排布，SHALL NOT 重叠。

#### Scenario: 深色模板不再白底

- **WHEN** pack 带 `geometry.docBackground = "#1A1A1A"`，渲染一份文档
- **THEN** 文档根帧填充为该颜色，主图占位使用 `geometry.placeholder` 的灰阶

#### Scenario: 标号按模板网格分布

- **WHEN** pack 的 `bubbleGrid` 有 3 个点位，主图实际 1200×719，文档有 3 个簇
- **THEN** 3 个标号分别落在对应比例位上，SHALL NOT 挤在同一列

#### Scenario: 缺少网格时沿用默认

- **WHEN** pack 没有 `bubbleGrid`
- **THEN** 标号按 `DEFAULT_BUBBLE_GRID` 摆放，与旧行为一致

#### Scenario: 章节按外框链套回边距与底色

- **WHEN** pack 的 `sectionShell` 为两层（各 pad 64，fill 分别为 `#000000` / `#161616`），文档有 2 个章节，根帧 3690 宽
- **THEN** 每个章节 SHALL 被包进两层纵向 HUG 外框（3690 → 3562），各层填充其 `fill`，
  章节左边缘落在 128，且章节之间、根帧首尾 SHALL 留出与外框 padding 之和相等的黑色间距

#### Scenario: 没有外框数据时保持原样

- **WHEN** pack 不带 `sectionShell`
- **THEN** 章节 SHALL 直接挂在根帧下，位置与引入该字段前一致
