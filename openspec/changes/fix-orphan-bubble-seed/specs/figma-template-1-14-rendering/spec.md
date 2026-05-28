## MODIFIED Requirements

### Requirement: 多章节气泡与说明块相互独立

在含 ≥ 2 个章节的文档中，第 N（N ≥ 2）个章节的气泡 FRAME 与说明块容器 SHALL 不含任何来自前序章节的残留子节点。渲染结束后，每个章节气泡 FRAME 内的气泡数量 SHALL 等于该章节的簇数量，不得多于或少于。

引擎 SHALL 在每个章节的 cluster 循环开始前，将气泡 FRAME 内多余的种子节点（索引 ≥ 1 的所有子节点）删除，确保仅保留 1 个种子供后续 clone 使用。此操作 SHALL 对每个章节独立执行，包括第一个章节（masterSectionGroup）。

#### Scenario: 第二章节气泡数量等于其簇数

- **WHEN** 第一章节有 5 个簇、第二章节有 3 个簇
- **THEN** 第一章节气泡 FRAME SHALL 含 5 个气泡节点，第二章节气泡 FRAME SHALL 含 3 个气泡节点，两者互不干扰

#### Scenario: 模板多余种子被清理

- **WHEN** 模板 `气泡` FRAME 初始含 2 个种子节点（`标号/2` 和 `标号/1`）
- **THEN** 引擎 SHALL 在 cluster 循环前删除第 2 个种子，渲染后该 FRAME 内气泡数量 SHALL 等于该章节簇数，不含孤儿节点
