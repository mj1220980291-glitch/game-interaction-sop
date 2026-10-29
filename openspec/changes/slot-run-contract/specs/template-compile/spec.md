## ADDED Requirements

### Requirement: 簇部件按 run 瘦身

簇部件瘦身 SHALL 按 `slot-run-contract` 定义的 run 切分执行，SHALL NOT 按节点名做全局裁剪。

规则：

- SHALL 保留第一个完整 run 的全部成员，其余 run 的每个根节点 SHALL 整批删除。
- 保留 run 内的条目数量 SHALL 与模板一致（`正文/规则` 有几条留几条，`#Title` 恰好 1 个）。
- 簇级表头 SHALL 原样保留，不参与裁剪。
- `正文/规则` 继承的旧文案 SHALL 换成 `正文占位`。

#### Scenario: 两段 run 只留一段

- **WHEN** 原稿簇带 2 段 run，每段含 1 个 `#Title`、1 个职能帧、2 条正文、1 个配图 GROUP
- **THEN** 产物 SHALL 只含 1 段 run、2 条 `正文/规则`、1 个职能帧、1 个配图 GROUP，且 SHALL NOT 残留第二个 `#Title` 或第二个职能帧

#### Scenario: 不再按名字裁到一条

- **WHEN** 原稿保留 run 内有 2 条可见 `正文/规则`
- **THEN** 产物 SHALL 保留 2 条，SHALL NOT 只留 1 条

#### Scenario: 多余职能帧随 run 删除

- **WHEN** 原稿第二个 run 的职能帧从未被归一化命名
- **THEN** 该帧 SHALL 随所属 run 一起被删除，SHALL NOT 作为孤儿节点留在产物里

### Requirement: 编译期配图槽 GROUP 化

编译 SHALL 把保留下来的配图槽统一为 GROUP 形态：`配图` GROUP 内含 `配图占位` 矩形与 `配图占位文案` TEXT。

- 原槽已是 GROUP 时 SHALL 原地清洗（清除图片填充、补齐缺失的占位文案）。
- 原槽是裸矩形或实例时 SHALL 包壳（`groupNodes`）并补齐两个子节点（`createText`）。
- 占位文案字体 SHALL 使用 `Noto Sans SC`；字体不可用时 SHALL 按 `V2_COMPILE_FONT_UNAVAILABLE` 失败。

#### Scenario: 清洗已有 GROUP

- **WHEN** 原稿配图 GROUP 内矩形带 IMAGE 填充
- **THEN** 产物 SHALL 清除该填充，且经纬与占位文案节点保留

#### Scenario: 包壳后可直接填图

- **WHEN** 原稿配图槽是裸矩形，编译后渲染写入资产
- **THEN** 渲染 SHALL 能找到 `配图占位` 矩形并填充，SHALL NOT 报「配图 GROUP 无 配图占位 矩形」

## MODIFIED Requirements

### Requirement: 前置校验

编译 SHALL 在写入画布前完成下列校验，任一失败即拒绝且 SHALL NOT 留下中间节点：

| 校验 | 失败码 |
|---|---|
| 库文件可写、可创建组件 | `V2_COMPILE_LIBRARY_UNWRITABLE` |
| `Noto Sans SC` 各用到的字重可加载 | `V2_COMPILE_FONT_UNAVAILABLE` |
| 源模板指纹与探针记录一致 | `V2_COMPILE_SOURCE_DRIFT` |
| 差异可被 8 项能力表达 | `V2_COMPILE_CAPABILITY_UNEXPRESSIBLE` |
| 每个簇原稿都能切出 ≥1 个完整 run | `V2_COMPILE_RUN_CONTRACT_BROKEN` |

字体校验失败时 SHALL 列出缺失的 `Noto Sans SC` 字重。

#### Scenario: 归一化字体不可用
- **WHEN** 本机无法加载 `Noto Sans SC` 的某个字重
- **THEN** 编译 SHALL 拒绝并列出该字重，SHALL NOT 产出字体混杂的组件

#### Scenario: 项目字体缺失不影响编译
- **WHEN** 部件中某文本使用 `U5Font` 且本机未安装
- **THEN** 编译 SHALL 正常完成（字体已归一化为 `Noto Sans SC`），SHALL NOT 因此拒绝

#### Scenario: 校验失败不留痕
- **WHEN** 任一前置校验失败
- **THEN** 库文件中 SHALL 不新增任何节点

#### Scenario: 原稿簇切不出 run
- **WHEN** 某簇原稿既无 `#Title` 也无 `正文/规则`
- **THEN** 编译 SHALL 返回 `V2_COMPILE_RUN_CONTRACT_BROKEN`，库文件 SHALL 不新增任何节点

### Requirement: 编译报告

编译 SHALL 返回机器可读报告，至少含：`phase`、`created`（每个部件的组件 id / key / 名字）、`adopted`（每个收编零件的来源与目标 id）、`anchors`（槽位 → 锚点方式）、`capabilities`（产物探针结果 + 与源模板的差异）、`gaps`、`checks`（前置校验结果）、`templateJson`（可落盘的草案或最终内容）。

报告 SHALL 同时提供人读版，逐条列出产出的组件、收编清单、锚点、能力差异与缺口。

瘦身后的 run 契约校验失败时，报告 SHALL 列出已创建但未回填 key 的组件 id，供人工清理。

#### Scenario: 干跑报告
- **WHEN** `write: false`
- **THEN** 报告 SHALL 含将创建 / 将收编 / 将打锚点的完整清单，且 `created` 中各 id SHALL 为 `null`

#### Scenario: 瘦身后失败
- **WHEN** 瘦身后某簇的 run 契约不成立
- **THEN** 报告 SHALL 包含 `V2_COMPILE_RUN_CONTRACT_BROKEN` 对应的缺口条目，且 SHALL 列出已建组件 id
