## MODIFIED Requirements

### Requirement: 簇内子分类小标题渲染

引擎 SHALL 按 `Cluster.groups` 数组分组渲染说明块。具体策略：

| group 数 | title 情况 | 渲染行为 |
|---|---|---|
| 1 | null | **完全等同 v2 旧版**：克隆 1 次说明块，bullets 平铺，不插小标题 TEXT，无任何新函数调用 |
| 1 | 非 null | 复用现有说明块，在 bullets TEXT 之前的 `subTitle` TEXT 写入 title |
| ≥ 2 | 任意 | 第 1 个 group 复用现有说明块，第 2..N 个 group 各通过 `cloneClusterBlock` 克隆 1 个新说明块；每个有 title 的 group 的说明块 `subTitle` TEXT 写入 title |

新插入/修改的小标题 SHALL 使用模板内 `subTitle` TEXT 节点（`name === SECTION_CHILD_NAMES.clusterSubTitle`）写入；若该节点不存在则克隆 bulletSource TEXT 并定位在 bullets TEXT 之上 4px（FRAME-local）。

角色标签 FRAME（`name starts with SECTION_CHILD_NAMES.roleTagsFramePrefix`）SHALL 只保留在第 1 个 group 的说明块中，并执行 keep-first 删除；第 2..N 个 group 的说明块 SHALL 整体删除角色标签 FRAME。

`配图：xxx` bullet 归属的 group 的说明块 SHALL 保留 imagePlaceholder；其他 group 的说明块 SHALL 删除 imagePlaceholder。

#### Scenario: 单 group + null title 完全向后兼容

- **WHEN** 簇 IR 为 `{ groups: [{ title: null, bullets: ['a', 'b'] }] }`
- **THEN** 渲染路径 SHALL 不调用 `cloneClusterBlock`，不调用 `insertSubgroupTitleText`，产物与 v2 旧版一致

#### Scenario: 双 group 各自独立说明块

- **WHEN** 簇 IR 为 `{ groups: [{ title: '基础信息', bullets: ['a'] }, { title: '升级反馈', bullets: ['b'] }] }`
- **THEN** 引擎 SHALL 在 Figma 内产出 2 个说明块：第 1 块 `subTitle='基础信息'`，bullet `a`，保留角色标签；第 2 块 `subTitle='升级反馈'`，bullet `b`，角色标签 FRAME 被删除

#### Scenario: 含配图的 group 保留占位，其余删除

- **WHEN** group[0].bullets = ['a']，group[1].bullets = ['b', '配图：xxx']
- **THEN** group[0] 的说明块 imagePlaceholder SHALL 被删除；group[1] 的说明块 SHALL 有 imagePlaceholder

#### Scenario: 第 2..N 说明块角色标签被整体删除

- **WHEN** 簇有 3 个 group
- **THEN** 第 2 和第 3 个说明块 SHALL 各自不含角色标签 FRAME（整体删除，不只是 keep-first 删除其中几个 TEXT）

#### Scenario: cloneClusterBlock 返回完整子节点集合

- **WHEN** 调用 `cloneClusterBlock(backend, sourceId, parentId)`
- **THEN** 返回的 `ClusterBlockNodes` SHALL 包含 `blockId`、`subTitle`（若存在）、`bulletSource`、`allBulletTexts`、`roleFrame`（若存在）、`imagePlaceholders`
