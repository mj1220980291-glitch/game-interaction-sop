## MODIFIED Requirements

### Requirement: 章节按 IR 顺序克隆界面说明组

每个非 `isGlobalSpec` 的章节 SHALL 克隆"界面说明 N"组（基于 1:14），并把章节名、章节序号写入对应位置；`isGlobalSpec` 章节 SHALL 删除主图占位 / 占位文案 / 气泡 FRAME 并保留右侧说明区。

引擎 SHALL 在渲染任何章节内容之前，先完成所有章节节点的克隆（两阶段策略）：阶段 1 从空白 masterSectionGroup 批量克隆所有 section node；阶段 2 再依次渲染各章节。克隆操作 SHALL 发生在 masterSectionGroup 尚未被任何内容填充时。

#### Scenario: 全局规范章节跳过主图区

- **WHEN** 一个章节 `isGlobalSpec=true`
- **THEN** 引擎 SHALL 调用 `backend.deleteNodes` 删除该章节的 `主图占位` / `占位文案` / `气泡 FRAME` 三类节点

#### Scenario: 多章节克隆源为空白模板

- **WHEN** 文档含 3 个章节
- **THEN** 引擎 SHALL 先克隆出 section node[0]（masterSectionGroup 本身）、node[1]（clone）、node[2]（clone），克隆完成后再开始填充 node[0]，不得在填充 node[0] 之后再克隆 node[1] 或 node[2]

## ADDED Requirements

### Requirement: 多章节气泡与说明块相互独立

在含 ≥ 2 个章节的文档中，第 N（N ≥ 2）个章节的气泡 FRAME 与说明块容器 SHALL 不含任何来自前序章节的残留子节点。渲染结束后，每个章节气泡 FRAME 内的气泡数量 SHALL 等于该章节的簇数量，不得多于或少于。

#### Scenario: 第二章节气泡数量等于其簇数

- **WHEN** 第一章节有 5 个簇、第二章节有 3 个簇
- **THEN** 第一章节气泡 FRAME SHALL 含 5 个气泡节点，第二章节气泡 FRAME SHALL 含 3 个气泡节点，两者互不干扰

#### Scenario: 第二章节说明块无前序章节残留

- **WHEN** 第一章节有 4 个说明块、第二章节有 2 个簇
- **THEN** 第二章节右栏 SHALL 仅含 2 个说明块，不出现第一章节填充的内容残留
