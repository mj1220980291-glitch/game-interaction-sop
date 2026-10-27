# template-contract Specification

## Purpose
TBD - created by archiving change template-contract-and-probe. Update Purpose after archive.
## Requirements
### Requirement: 模板铁律

任何要被本引擎渲染的模板 SHALL 满足下列 6 条铁律；任一不满足 SHALL 判定为不可接，且引擎 SHALL NOT 尝试渲染。

| ID | 铁律 |
|---|---|
| F1 | 文档根部存在顶部元信息区，含 ≥2 个可映射的元信息项（文档名 / 负责人 / 日期 / 链接 任一类） |
| F2 | 章节 = 一个图片容器 + 一个文本说明容器 |
| F3 | 说明容器内含 ≥1 个簇单元 |
| F4 | 簇 = 编号载体 + 标题文本 + ≥1 条内容行 |
| F5 | 章节可克隆（同形单元 ≥2，或存在同形隐藏单元） |
| F6 | 簇可克隆（同上） |

铁律判定 SHALL 只依赖节点结构，不依赖项目特定的图层命名。

#### Scenario: 官方模板满足全部铁律
- **WHEN** 对 `1:14`（`UYCJok3MXTWITMfeJSqEF6`）执行铁律判定
- **THEN** F1–F6 SHALL 全部通过

#### Scenario: 缺章节母版
- **WHEN** 模板只有一个章节单元，且不存在同形隐藏单元
- **THEN** F5 SHALL 不通过，整体结论 SHALL 为 `non-conformant`，并且 SHALL NOT 输出能力判定结果

### Requirement: 能力枚举与缺省值

引擎 SHALL 用 8 项能力描述模板差异，每项取值受限、且都有缺省值。缺省值集合 SHALL 与官方 `1:14` 等价。

| key | 取值 | 缺省 |
|---|---|---|
| `overview` | `two-frames` / `single-block` / `none` | `two-frames` |
| `clusterGroups` | `slot-run` / `inline-subtitle` / `none` | `slot-run` |
| `badgeSlot` | `container` / `manual` / `none` | `container` |
| `numberBadge` | `text` / `instance` / `none` | `text` |
| `roleAnnotation` | `component-variant` / `inline-suffix` / `none` | `component-variant` |
| `figure` | `named-group` / `first-non-text` / `none` | `named-group` |
| `hiddenPool` | `reuse` / `ignore` / `absent` | `ignore` |
| `column` | `right` / `bottom` | `right` |

未知能力键或越界取值 SHALL 报错，SHALL NOT 静默取缺省。

#### Scenario: 空配置回落缺省
- **WHEN** 模板包只写了 `schema_version`，没有 `capabilities`
- **THEN** 8 项能力 SHALL 全部取缺省值，且行为与渲染官方 `1:14` 一致

#### Scenario: 越界取值被拒
- **WHEN** 模板包的 `numberBadge` 值为 `triangle`
- **THEN** 解析 SHALL 返回错误，列出合法取值，且 SHALL NOT 回落缺省

### Requirement: 归一化模板由 4 个部件组成

归一化模板 SHALL 由 4 个可独立导入的部件构成：`top`（顶部）、`chapter`（章节）、`cluster`（簇）、`footer`（结尾，可选）。

每个部件 SHALL 有自己的库组件 key；引擎 SHALL NOT 依赖「在组件集里按名字找变体」的方式定位部件。

交付文档 SHALL NOT 包含任何母版节点（母版存在于库，不在文档内）。

#### Scenario: 部件 key 缺失
- **WHEN** 模板包的 `components` 缺 `chapter`
- **THEN** 渲染前 SHALL 报错并指出缺失部件名，SHALL NOT 开始写入画布

#### Scenario: footer 可选
- **WHEN** 模板没有结尾区，`components.footer` 未提供
- **THEN** 渲染 SHALL 正常完成，且 SHALL NOT 追加结尾节点

### Requirement: 项目模板包

项目模板包 SHALL 由 `<项目根>/.interaction-sop/template.json`（机器读）与 `md-contract.md`（人读）组成，并与既有 `style*.md` 并存互不覆盖。

`template.json` SHALL 至少包含：`schema_version`、`source`（`fileKey` / `nodeIds` / `fingerprint`）、`components`、`capabilities`。`anchors` SHALL 只在非缺省命名时出现。

读取顺序 SHALL 为：项目根模板包 → `~/.game-interaction-sop/templates/<项目名>.json` → 全局 default → 官方 `1:14`。模板包不存在或解析失败 SHALL 完全回落到本变更之前的行为。

#### Scenario: 无模板包时行为不变
- **WHEN** 项目目录没有 `.interaction-sop/template.json`
- **THEN** 模板解析结果 SHALL 与 `template-config.ts` 现有实现逐字段一致

#### Scenario: 用户不需要手写配置
- **WHEN** 探针完成并写出模板包
- **THEN** 后续渲染 SHALL 无需任何新入参即可使用该项目的模板

### Requirement: 结构指纹与漂移

模板包 SHALL 保存源模板的结构指纹，指纹 SHALL 只由结构与形状特征（层级、节点类型序列、名称集合、尺寸量级）决定，SHALL NOT 包含文本内容。

渲染前 SHALL 比对指纹；不一致时 SHALL 输出软警告 `V2_W_TEMPLATE_DRIFT` 并继续渲染。铁律不满足时才 SHALL 硬拒绝。

#### Scenario: 文案改动不触发漂移
- **WHEN** 源模板只改了某段文字内容
- **THEN** 指纹 SHALL 不变，渲染 SHALL NOT 产生漂移警告

#### Scenario: 结构改动触发漂移
- **WHEN** 源模板新增或删除了一个节点
- **THEN** 指纹 SHALL 变化，渲染 SHALL 输出 `V2_W_TEMPLATE_DRIFT`

### Requirement: md 契约是模板结构的投影

`md-contract.md` SHALL 描述该项目的书写习惯，至少覆盖：顶部字段集、章节标题规则、簇内是否输出子分级、`@职能` 的写法位置。

模板结构 SHALL 为准：当 md 契约与模板结构冲突时，引擎 SHALL 报错并指明冲突项，SHALL NOT 猜测或双写兼容。

#### Scenario: 模板无簇内第二级
- **WHEN** 模板能力 `clusterGroups` 为 `none`，而 Markdown 中出现 `####`
- **THEN** 引擎 SHALL 报错指出「该模板不支持簇内分级」，SHALL NOT 静默丢弃 `####` 内容

#### Scenario: 模板无总览区
- **WHEN** 模板能力 `overview` 为 `none`，而 Markdown 含 `## 设计总览`
- **THEN** 引擎 SHALL 报错指出「该模板不支持总览区」，SHALL NOT 把总览内容塞进其他槽位

### Requirement: 归一化模板归属

归一化模板 SHALL 归本引擎维护，SHALL 存放于我们自己的库文件；项目源模板仅作为编译输入。

归一化模板中的**任何**组件引用 SHALL 指向本库自有组件，SHALL NOT 指向项目源文件或第三方库的组件 key。

源模板被修改、重命名或删除后，已发布的归一化模板 SHALL 保持可用，SHALL NOT 出现占位或灰框。

#### Scenario: 源文件删除后仍可用
- **WHEN** 项目源模板文件被删除
- **THEN** 已发布的 4 个部件 SHALL 仍能按 key 导入并正常显示

#### Scenario: 后续维护以归一化模板为准
- **WHEN** 需要调整部件的图层结构或样式
- **THEN** 改动 SHALL 在库文件中的归一化模板上进行，SHALL NOT 依赖源模板重新编译

### Requirement: 能力描述归一化模板

`template.json` 的 `capabilities` SHALL 描述归一化模板（即渲染时实际 import 的那棵树）的结构，SHALL NOT 描述项目源模板的结构。

编译流程 SHALL 以对归一化模板产物的探针结果为准；与源模板探针结果的差异 SHALL 显式报告。

#### Scenario: 配置与实际结构一致
- **WHEN** 渲染读取 `capabilities.numberBadge`
- **THEN** 该值 SHALL 与归一化模板产物中编号载体的实际形态一致

