## ADDED Requirements

### Requirement: 部件空壳化

编译 SHALL 在槽位命名归一化之后清空部件里的原稿内容，只保留样式载体。

| 部件 | SHALL 删除 | SHALL 保留 |
|---|---|---|
| `chapter` | 说明栏容器内全部子节点；`气泡` 内除母版外的标号 | 图区几何、说明栏容器、`标号/母版` |
| `cluster` | 可见 `正文/规则` 与可见 `#Title` 中除第一个以外的部分 | 编号、标题、一个内容行、一个分组槽、隐藏备用池、配图槽 |

删除 SHALL 分批执行（每批 ≤2 个节点），SHALL NOT 一次提交整棵子树。

编译报告 SHALL 返回 `slimmed`（删除节点数）。

#### Scenario: 章节不带原稿簇
- **WHEN** 章节母版说明栏里有 5 个簇
- **THEN** 产物章节部件的说明栏 SHALL 为空容器，且 `气泡` 内只剩 `标号/母版`

#### Scenario: 隐藏备用池保留
- **WHEN** 簇部件末尾有隐藏的 `正文/规则` 备用槽
- **THEN** 空壳化 SHALL 保留该隐藏槽，`hiddenPool = reuse` 仍可复用

#### Scenario: 幂等
- **WHEN** 对已空壳化的部件再编一次
- **THEN** `slimmed` SHALL 为 0，SHALL NOT 删掉已保留的唯一内容行
