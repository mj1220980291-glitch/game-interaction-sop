## Why

引擎目前只认一套模板**结构**：`template-map.ts` 把 14 个槽位名、7 个角色 TEXT 顺序、字体、画布尺寸、默认气泡网格全部写死。`template-config.ts`（2.2.2 新增）只放开了**地址**（`fileKey` / `nodeId` / `componentKey`），文件头注释也明说了「internal structure is not configurable」。结果就是：接一个模板结构不同的项目 = fork 引擎。

用第二个真实项目模板验证过这个前提。`Agent草稿` 的「不同项目模板」页上有两份文档（`796:12489`「局内相关交互」、`798:17608`「角色系统」），同属一套模板，结构与官方 `1:14` 对比如下：

| 维度 | 官方 1:14 | 惊魂寻宝队（796 / 798） |
|---|---|---|
| 顶部元信息 | 5 个固定 TEXT | 审核者 / 日期 / 文档名 / 职能图例标签×6 / UX / 策划 |
| 总览区 | 有（功能背景 + 核心交互） | **无** |
| 章节 | 唯一 `界面说明1 (1:44)` 克隆 | `界面图示`（1200 图）+ `Frame 1243`（932 右栏） |
| 章节母版 | `界面说明1` | 整个 `Group 2360` 复制粘贴 |
| 簇 | `说明块NN` + `#Title_Main` + 2 个 `#Title` slot run | `Frame 12xx` > `Group 1253`，标题 + 扁平行序列 |
| 簇母版 | 模板自带 2 个 slot run | 每章末尾**隐藏**的 `Frame 1244`「草稿面板」 |
| 簇内分级 | 有（`####` → slot run） | **无** |
| 图上标号 | `气泡` FRAME 容器，引擎可算坐标 | 散落 `num` 实例（三角 + 内文本），手工摆、会漏 |
| 职能标注 | `- @策划：` → 职能标记组件实例 | 句尾内联 `…@GUI@程序@拼接` + 顶部图例 |
| 编号 | 裸 TEXT `#Number` | 组件实例内 TEXT（层名恒为 `1`） |
| 隐藏备用池 | 无 | 每个 `Frame 808` 尾部 9 个隐藏槽 |

由此得出三条结论：

1. **结构差异只有 3 处是真差异**（有没有总览区、簇内有没有第二级、图上标号有没有容器），其余都是策略（编号载体、职能写法、配图判据、隐藏池用法）。不需要「每类骨架一个后端」。
2. **材料齐备**：母版存在，只是没标记。所以可以「读一次 → 编译成我们自己的可渲染模板」，维护权收回我们这边。
3. **样式不需要配置**：字体、颜色、间距、标号形状靠**克隆**继承，进不了配置表的都不该进配置。

## What Changes

本变更只做前两步（契约 + 探针），它们是后续所有工作的地基，且画布零风险。

- 新增 **模板契约 v1**：4 条铁律 + 2 个母版要求；8 项能力枚举（每项带 `none`/缺省值），官方 `1:14` 即全部缺省值。
- 新增 **项目模板包**格式：`template.json`（4 个部件 key + 能力 + 锚点 + 指纹）与 `md-contract.md`（书写习惯投影），并规定四级配置查找顺序。
- 新增 **只读探针** `figma_probe_template`：读陌生模板 → 判铁律 → 找母版 → 判能力 → 出报告与 `template.json` 草案 → 记结构指纹。**画布零写入。**
- 探针三态结论：`ready` / `needs-anchor` / `non-conformant`，互斥，不得混报。
- 探针输出每项都带来源标记：`probed`（量出来的）/ `inferred`（推出来的）/ `default`（按契约缺省）。推断项必须人确认。

**本变更不做**：编译写库、发布组件库、引擎多部件渲染、md 契约自动生成。它们是后续两个变更，`design.md` 里写明切分。

## Capabilities

### New Capabilities

- `template-contract`：铁律、2 个母版、8 项能力枚举、4 部件模型、项目模板包格式与四级查找、指纹与漂移、md 契约的最小字段集。
- `template-probe`：只读约束、扫描内容与顺序、三态结论、来源标记、草案生成、不得写入画布。

### Modified Capabilities

- `engine-mcp-server`：新增只读工具 `figma_probe_template`。

## Impact

- `packages/figma-mcp-server/src/v2/probe/`（新增）：骨架识别、母版发现、能力判定、指纹、报告与草案
- `packages/figma-mcp-server/src/server/createServer.ts`：注册 `figma_probe_template`
- `packages/figma-mcp-server/src/v2/template-config.ts`：扩展读取模板包（只读扩展；缺省行为与现在完全一致）
- `packages/skill/references/template-contract.md`（新增，契约权威文档）；`template-1-14.md` 头部声明自己是「契约 v1 的实现 #1」
- `packages/skill/phases/phase4-figma.md`：preflight 加一步「探针报告 `ready` 才渲染」
- 现有渲染路径**不改**：不碰 `render.ts` 填充逻辑，`1:14` 渲染的调用序列与行为不变
- 已交付文档不回改

## 后续变更（不在本变更范围）

| 变更 | 内容 | 为什么排后面 |
|---|---|---|
| `template-compile-to-library` | 把项目模板编译成我们库里的 4 个原子组件（顶部 / 章节 / 簇 / 结尾），发布取 key | 要写画布，必须先把探针判据跑准 |
| `engine-multi-part-template-render` | 渲染改为「导入 4 部件 → detach → append」，落地 8 项能力与策略 | 依赖编译产出的 key |
