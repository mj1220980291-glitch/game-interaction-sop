## Why

渲染期需要一批「不算能力、但决定观感」的量：文档底色、主图占位尺寸、占位填充色、标号网格、章节宽度、部件间距。现在这些要么写死在代码里（`PARTS_GAP=0`、`MAIN_IMAGE_SIZE 1920×1080`、`DEFAULT_BUBBLE_GRID`、`2209` 兜底），要么只能靠人填（`docBackground`）。官方1.14 重编后渲染出来是**白底 + 白字**（模板本身是深底），蛋仔的标号挤在一列，都是这个缺口的表现。

这些值本来就在模板里，编译期能测出来，应该在编译期记进 pack、渲染期直接用。

## What Changes

- 模板包新增 `geometry` 段（全部可缺省，缺省即现有行为）：
  `docBackground`、`chapterWidth`、`mainImage`、`placeholder`、`bubbleGrid`、`badgeSize`、`rootGap`
- 编译期从**产物部件实测**这些值并写进 pack：
  章节宽度与主图占位尺寸取章节组件；占位填充/描边取 `主图占位`；标号网格与母版尺寸取 `气泡` 里已有的 `标号/N`；`docBackground` 取源模板根节点填充
- 渲染期优先用 `pack.geometry`：部件间距、章节宽度兜底、占位灰阶、标号换算比例与网格点位
- `figma_compile_template` 不再要求手填 `docBackground`（仍接受覆盖）

## Capabilities

### New Capabilities
- `template-geometry`: 模板几何与色彩的采集与使用——采什么、怎么采、缺省怎么退化

### Modified Capabilities
- `template-contract`: 模板包新增可选的 `geometry` 段

## Impact

- `src/v2/template/schema.ts`：`TemplatePack.geometry` + 解析
- `src/v2/compile/geometry.ts`（新）：从产物部件实测几何
- `src/v2/compile/index.ts`、`backfill.ts`：写入 `geometry`
- `src/v2/render/parts/index.ts`、`parts/geometry.ts`、`render.ts`：读 `geometry`，缺省回落现有常量
- `tests/v2/`：schema 解析、采集、回落三组用例
