## ADDED Requirements

### Requirement: 章节母版自带示例簇 SHALL 在 parts 渲染时清理

parts 渲染 SHALL 清理章节子树里既不属于本轮生成簇、也不属于说明栏 / 主图 / 标题 / 编号槽位的样板簇（典型特征：含 `簇标题`、`正文占位`、多个 `职能标记=*`、`配图占位`）。判定 SHALL 基于结构特征与模板能力，SHALL NOT 写死 nodeId、页面名或项目名。清理对象 SHALL 优先隐藏；确认不影响版式后可直接移除。清理失败 SHALL 只追加软警告，SHALL NOT 中断渲染，也 SHALL NOT 影响本轮真实簇、气泡、编号与 foreign 说明栏。

#### Scenario: 章节母版带示例簇
- **WHEN** 章节组件内预置了一个含簇标题、正文占位、三行职能与配图占位的样板簇，md 该章有 2 个真实簇
- **THEN** 渲染结果 SHALL 只包含 2 个真实簇，示例簇 SHALL 不显示；`状态说明` 等 foreign 说明栏 SHALL 保留

#### Scenario: 清理失败
- **WHEN** 隐藏或删除示例簇时插件超时
- **THEN** 渲染 SHALL 继续完成，并追加一条软警告说明残留位置
