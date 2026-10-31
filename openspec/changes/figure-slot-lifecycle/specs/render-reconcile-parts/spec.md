## ADDED Requirements

### Requirement: 配图条目增删的同步语义

md 的 `配图：` 条目集合与产物配图槽集合不一致时，同步 SHALL 按下列语义收敛，不得视为未定义行为：

| md 变化 | 槽未被人工改动 | 槽被人工改动过 |
|---|---|---|
| 新增条目 | 由 scratch 管线供给新槽并填图，`changes` 记 `insert` | 同左（新增不冲突） |
| 删除条目 | 整组删除，`changes` 记 `delete` | 报冲突（`deleted-but-changed` / `figure`），节点保留 |
| 描述变更 | 只更新占位文案与 stamp，SHALL NOT 重建节点 | 报冲突，保留人工内容 |
| 描述不变、资产变更 | 按 `sameAsset` 判后重填图，槽身份不变 | 保留人工图并报冲突 |

「是否被人工改动」SHALL 以 stamp 里的图 hash 与占位文案文本为判据，SHALL NOT 以节点是否存在推断。

引擎未创建的配图槽（无 stamp）SHALL 作为 foreign 保留在 `preserved` 中，SHALL NOT 被删除，也 SHALL NOT 报冲突。

同步完成后 SHALL 重算章节几何。

#### Scenario: 新增一条配图

- **WHEN** md 给某簇新增 `配图：准备阶段`，`assetMap` 提供 `NN/C/K`
- **THEN** 同步 SHALL 补出新槽并填图，`changes` 含 `insert`，产物槽数为 N+1

#### Scenario: 删除未手改的配图

- **WHEN** md 删掉某簇一条 `配图：`，该槽图 hash 与 stamp 一致、占位文案未被改
- **THEN** 同步 SHALL 删除该槽整组，`changes` 含 `delete`

#### Scenario: 删除但有手改

- **WHEN** md 删掉某条 `配图：`，但该槽的图被人工替换过（hash 与 stamp 不符）
- **THEN** 同步 SHALL 报冲突并保留该槽

#### Scenario: 人工加的配图槽

- **WHEN** 产物某簇存在一个没有 stamp 的配图槽，md 无对应条目
- **THEN** 同步 SHALL 将其列在 `preserved`（foreign）并保留，SHALL NOT 判为冲突

#### Scenario: 只改描述

- **WHEN** md 把 `配图：图一` 改成 `配图：图一改名`，资产不变
- **THEN** 同步 SHALL 只改占位文案与 stamp，槽节点 id SHALL 不变，SHALL NOT 重新填图
