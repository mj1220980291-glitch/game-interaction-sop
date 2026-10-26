## Why

上一变更让引擎能**体检**任意项目模板（`figma_probe_template`，只读、三态结论、`template.json` 草案）。但草案里 `components` 四个字段是 `null`——引擎仍然没有可渲染的模板。把草案变成能渲染的模板，需要在本变更里完成。

真机核对（`1:14` / `798:17608` / `796:12489`）后暴露了三个硬约束，它们决定了本变更的形状：

| 约束 | 事实 | 后果 |
|---|---|---|
| 插件是文件作用域的 | 没有任何跨文件读节点 / 拷贝节点的 API；`importComponentByKeyAsync` 只认**已发布**组件的 key | 源部件必须先「过门」进库文件 |
| 项目母版不是组件 | `798` 的章节母版是普通 `Group 2360`，簇母版是隐藏 `Frame 1244`；`1:14` 才是 `COMPONENT` | 「凭 key 取值」这条路对多数项目走不通 |
| 发布没有 API | Figma 插件 API 没有 publish；发布是 Assets 面板里的人工动作 | 流程必须切成「编译 → 人工发布 → 回填」两段 |

另一方面，嵌套部件的归属必须一次说清：`798` 的顶部有「标签」（职能图例）组件集，章节图上有「num」三角编号实例，它们引用的是**别人家**的组件。若原样留在我们库里，对方删组件 / 改名 / 挪文件，我们这边立刻变灰框，且这条失效**在编译期完全不可见**，只在渲染时炸。

结论：归一化模板必须**收编**——嵌套部件在我们库里重建为我们自己的组件并一起发布，父部件引用自家 key，此后与源模板彻底脱钩，维护以我们为准。这同时保住了用户可改的语义（编号仍是可写文字的组件，不是死图）。

## What Changes

- **新增编译流程**：读项目模板 + 2~3 份文档样本 → 在我们自己的库文件里生成 4 个原子组件（`top` / `chapter` / `cluster` / `footer` 可选）→ 打锚点 → 交人工发布 → 回填 4 个 `componentKey` 到 `.interaction-sop/template.json`。
- **新增嵌套部件收编**：部件内部的实例（职能图例、`num` 三角等）在库文件里重建为**本库自有组件**（含组件集变体重建），先发子、后发父；父部件引用自家 key。
- **新增字体归一化**：部件内全部文本统一改写为 `Noto Sans SC`（字重就近映射），只保留字号 / 行距 / 字色。项目字体（`U5Font` 等）不参与产物，不要求安装，也不会出现静默字重回退。
- **新增标号容器统一**：章节图区按官方 `1:14` 的 `气泡` FRAME 形态预置一个空标号容器；源模板是散落标号（`badgeSlot=manual`）时补齐，能力自然判成 `container`，差异进 `gaps`。
- **新增锚点写入**：`plugin data`（命名空间 `gisop`）优先，不可保留时降级为「约定图层名」或「不可见零高度 FRAME」。锚点只写在库文件里，**项目源模板零写入**。
- **能力基准改判**：`capabilities` 描述的是**归一化模板**的结构，不是源模板。编译完成后对产物重跑一次探针，用产物结果覆盖源模板结论；差异计入 `gaps`。
- **新增 MCP 工具** `figma_compile_template`（写入类，需确认）：`phase: compile | verify`。`compile` 产出组件与草案，`verify` 在人工发布后读 `component.key` 并回填。
- **新增拒绝路径**：现有 8 项能力表达不了的差异 → 中止编译，输出缺口与原因，**不临时加能力**。

**本变更不做**：

- 不改 `render.ts`；引擎仍按旧路径渲染 `1:14`。多部件渲染是下一个变更。
- 不做插件的跨文件自动搬运（「抄清单」桥）。本变更的搬运是一次人工粘贴，见 design D2。
- 不生成 `md-contract.md`（仍遗留）。
- 不做一项目多套模板。
- 不做标号摆位（容器按 `1:14` 形态补齐，具体摆放留后续统一解决，见 design D9）。

## Capabilities

### New Capabilities

- `template-compile`：源模板只读、4 部件产出、嵌套部件收编、锚点策略、能力以产物为准、发布与回填、拒绝而非扩张、前置校验、编译报告。

### Modified Capabilities

- `engine-mcp-server`：新增写入类工具 `figma_compile_template`（`compile` / `verify` 两阶段）。
- `template-contract`：新增「归一化模板归属」与「能力基准是归一化模板」两条要求。

## Impact

- `packages/figma-mcp-server/src/v2/compile/`（新增）：部件切分、收编、锚点、产物探针、报告
- `packages/figma-mcp-server/src/v2/figma-client.ts`：`FigmaBackend` 增加 `createComponentFromNode` / `combineAsVariants` / `setPluginData` / `renameNode` / `readComponentKey` 等可选方法
- `packages/figma-mcp-server/src/server/figmaConsoleBackend.ts`：实现上述后端方法
- `packages/figma-mcp-server/src/server/createServer.ts`：注册 `figma_compile_template`，更新 `server.spec.ts` 工具清单断言
- `packages/skill/references/template-compile.md`（新增）：编译 SOP（含人工粘贴那一步的操作说明）
- `packages/skill/references/template-contract.md`：补「归一化模板归属」一节
- `packages/skill/phases/phase4-figma.md`：探针 `ready` 之后增加「编译 / 回填」分支说明
- 项目源模板**只读**，`figma_probe_template` 前后指纹必须一致

## 后续变更（不在本变更范围）

| 变更 | 内容 |
|---|---|
| `engine-multi-part-template-render` | 渲染改为「导入 4 部件 → detach → append」，落地 8 项能力，含 `clusterGroups` / `hiddenPool` 的函数级分叉 |
| `template-transport-bridge` | 插件跨文件自动搬运（SVG 图纸桥 或 属性清单桥），替代人工粘贴 |
| `template-md-contract-gen` | 由模板结构生成 `md-contract.md` |
