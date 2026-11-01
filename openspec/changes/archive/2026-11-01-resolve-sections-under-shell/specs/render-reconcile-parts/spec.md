## ADDED Requirements

### Requirement: 章节外框下的章节发现

多部件文档的章节 SHALL 在 root 子树里按 stamp（`kind: 'section'`）收集，SHALL NOT 依赖「所有章节是同一个容器的直属子级」这一假设。

渲染 SHALL 给每章外层的结构节点（`geometry.sectionShell` 产生的「章节外框」及同层链）写入 `{ kind: 'slot', role: 'template' }` 标记。

同步 SHALL 把「子树里含 stamped 章节」的容器当作结构层跳过，SHALL NOT 列入 `foreign`。

#### Scenario: 壳内章节可识别

- **WHEN** 4 个章节各自被「章节外框」包住，md 未改动
- **THEN** 同步 SHALL 识别全部 4 章，`changes` 为空，`preserved` 中 SHALL NOT 出现 `designer-deleted`

#### Scenario: 结构层不算 foreign

- **WHEN** 文档每章外面套了一层「章节外框」
- **THEN** 这些外框 SHALL NOT 出现在 `preserved` 的 `foreign` 列表中

#### Scenario: 老产物壳没打标

- **WHEN** 章节外框没有 stamp（本变更之前渲染的文档）
- **THEN** 章节发现 SHALL 仍然成立，同步 SHALL NOT 误报 `designer-deleted`
