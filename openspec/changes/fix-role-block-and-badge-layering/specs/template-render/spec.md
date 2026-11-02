## ADDED Requirements

### Requirement: 职能标记组件在两条渲染路径一致生效

`@职能` 条目 SHALL 在 legacy 路径与多部件（parts）路径产生完全相同的结果：一个按角色选中的 `职能标记` 组件实例，正文写入该变体「非标签」的 TEXT。

渲染入口 SHALL 只解析一次角色运行时（`roleBlock` 配置 + 变体表），并把它显式传给下游的章节 / 簇填充函数；parts 路径 SHALL NOT 因未传该运行时而在 `填充章节` 阶段抛 `V2_ROLE_BLOCK_UNAVAILABLE`。

角色变体的来源优先级 SHALL 为：`roleBlock.variantKeys`（库引用，`importComponentByKeyAsync`）优先于 `roleBlock.componentSetId`（同文件组件集，`getNodesInfo` 读变体）。两者同时配置时 SHALL 使用 `variantKeys`，SHALL NOT 读取组件集。

#### Scenario: parts 路径渲染职能实例

- **WHEN** 项目命中模板包（走 parts 路径）且 `roleBlock.variantKeys` 含 `程序` 的已发布 key，md 某簇含 `- @程序：命中后播特效`
- **THEN** 渲染 SHALL 成功，该簇内出现 `职能标记=#程序` 实例，其实例正文 SHALL 为「命中后播特效」，且 `warnings` SHALL NOT 含 `V2_ROLE_BLOCK_UNAVAILABLE`

#### Scenario: 两种来源同时配置

- **WHEN** 配置同时含 `variantKeys` 与 `componentSetId`，且 `componentSetId` 指向不存在的节点
- **THEN** 渲染 SHALL 只用 `variantKeys` 成功完成，SHALL NOT 因组件集不可读而失败或降级

### Requirement: 职能可用性在克隆模板前预检

引擎 SHALL 在解析 IR 之后、克隆或实例化模板之前，按 IR 中实际出现的角色逐个校验可用性（`variants` ∪ `variantKeys`）。缺失角色时 SHALL 直接返回错误，SHALL NOT 在画布上建立任何节点。

错误码 SHALL 为 `V2_ROLE_BLOCK_UNAVAILABLE`，并 SHALL 在 `details.missingRoles` 中列出全部缺失角色。

`roleBlock.componentSetId` 在渲染目标文件内读不到时，错误码 SHALL 为 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`，message SHALL 说明「`componentSetId` 只在渲染目标文件内解析，跨库请改用 `roleBlock.variantKeys`」。

#### Scenario: 模板克隆前拒绝

- **WHEN** md 用了 `@美术`，配置只提供 `策划` / `程序` 的变体
- **THEN** 调用 SHALL 返回 `V2_ROLE_BLOCK_UNAVAILABLE` 且 `details.missingRoles = ["美术"]`，页面上 SHALL NOT 出现新增节点

#### Scenario: 跨库组件集

- **WHEN** `roleBlock.componentSetId` 指向模板库文件里的组件集，而渲染目标文件是另一个文件
- **THEN** SHALL 返回 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`，message 含改用 `variantKeys` 的指引

## MODIFIED Requirements

### Requirement: 标号摆位

`badgeSlot = container` 时，渲染 SHALL 为每个簇在 `气泡` 内生成一个标号：克隆标号母版 → 写入编号 → 摆位 → 强制可见。

摆放坐标 SHALL 取自模板自带网格（第 i 个簇取第 i 个网格点，按章节内序号），或调用方提供的 `badgeAnchors`。标号 SHALL 位于图区之上。

主图落图 SHALL NOT 改变模板原有层序：以 `figma_instance` 资产替换主图占位时，新实例 SHALL 插回占位节点原来的兄弟索引，并 SHALL 继承占位节点的名称。

无可用母版时 SHALL 返回 `V2_RENDER_BADGE_MASTER_MISSING`，SHALL NOT 静默跳过。

#### Scenario: 按网格摆位

- **WHEN** 某章节有 3 个簇且无坐标资产
- **THEN** `气泡` 内 SHALL 有 3 个标号，编号为 1/2/3，坐标分别等于网格前 3 点

#### Scenario: 资产坐标覆盖

- **WHEN** 某章节有 3 个簇且无额外坐标来源
- **THEN** 3 个标号 SHALL 分别落在网格前 3 点，且不影响其他章节的编号

#### Scenario: 主图实例不压住标号

- **WHEN** 模板章节的 `舞台` 子节点顺序为 `[气泡, 主图占位]`，且该章资产类型为 `figma_instance`
- **THEN** 主图实例 SHALL 落在原 `主图占位` 的索引上（仍排在 `气泡` 之后），该章所有标号 SHALL 可见，SHALL NOT 需要手工提层

#### Scenario: 主图槽名保留

- **WHEN** 主图占位节点名为 `主图`，以 `figma_instance` 资产替换
- **THEN** 替换后的实例名称 SHALL 仍为 `主图`，后续打标 SHALL 能命中 `main` 槽位
