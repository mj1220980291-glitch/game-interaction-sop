## MODIFIED Requirements

### Requirement: 部件导入与拼装

新路径 SHALL 对每个部件执行 `importComponentByKey` → `createInstance` → `detach`，并把 detach 后的节点挂到新建的文档根帧下：`top` 在前，`chapter` 按 md 顺序，`footer` 在末。

文档根帧 SHALL 由渲染创建并设为纵向自动布局（`itemSpacing` = 部件间隔、高度 HUG），部件挂入后由自动布局排布与撑高；根帧宽度 SHALL 取各部件最大宽度。

后端未实现 `setAutoLayout` 时 SHALL 回落手工排版：逐部件写 y 坐标并一次性设根帧高度，行为与变更前一致。

部件自带自适应（根 `layoutMode` 为 `HORIZONTAL` / `VERTICAL`）时，渲染 SHALL NOT 手工改写其高度。

#### Scenario: 章节增高不错位
- **WHEN** 某章节簇数量远多于模板自带槽位，填充后章节高度增大
- **THEN** 后续章节与结尾 SHALL 整体下移，且任意两部件 y 区间 SHALL NOT 重叠

#### Scenario: 根帧自动布局
- **WHEN** 后端实现了 `setAutoLayout`
- **THEN** 文档根帧 SHALL 是纵向自动布局且高度 HUG，渲染 SHALL NOT 手工累加 y

#### Scenario: 部件自带 HUG 链
- **WHEN** 章节部件根 `layoutMode = HORIZONTAL`
- **THEN** 渲染 SHALL NOT 对该章节调用 `resizeNode` 改高度

#### Scenario: 后端不支持布局
- **WHEN** 后端未实现 `createFrame` 或 `resizeNode`
- **THEN** 渲染 SHALL 返回 `V2_RENDER_LAYOUT_UNSUPPORTED`，且 SHALL NOT 在画布上留下任何节点

#### Scenario: 隐藏母版克隆后可见
- **WHEN** 被导入的部件由隐藏母版编译而来
- **THEN** 渲染 SHALL 将挂载后的节点设为可见
