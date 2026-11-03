## MODIFIED Requirements

### Requirement: 模板能力未实现时 SHALL 告警

模板包声明了引擎尚未实现的能力取值时，引擎 SHALL 产出软告警、说明被丢弃的数据，SHALL NOT 静默降级。

`capabilities.roleAnnotation = 'inline-suffix'` **不再属于未实现能力**：该取值下职能 SHALL 拼在正文句尾并上色（见下一条需求），SHALL NOT 产生「职能未写入」告警。

#### Scenario: 蛋仔包渲染带职能的簇

- **WHEN** 模板包 `roleAnnotation: inline-suffix`，某簇 markdown 写了 `@GUI @程序`
- **THEN** 渲染 SHALL 完成，首条正文 SHALL 以 ` @GUI @程序` 结尾，SHALL NOT 出现 `V2_W_ROLE_ANNOTATION_UNSUPPORTED`

#### Scenario: 组件变体包不受影响

- **WHEN** 模板包 `roleAnnotation: component-variant`
- **THEN** 正文 SHALL NOT 追加句尾职能，职能由「职能标记」实例承载

## ADDED Requirements

### Requirement: inline-suffix 职能 SHALL 拼在正文句尾并上色

`capabilities.roleAnnotation = 'inline-suffix'` 时，引擎 SHALL 把该簇的职能以 `@GUI @程序` 的形式拼到**第一条普通正文**的句尾：

- 跳过配图条目（`配图：…`）与 `@职能` 条目；
- 拼装后的文本 SHALL 作为「渲染结果」参与打标与同步比对（`expectedItems({ inlineRoles: true })` 产出同一份文本），否则幂等同步会来回重写；
- 拼装出的 `@职能` token SHALL 按 `ROLE_COLORS` 上色（写 characters 会冲掉原稿字符样式，写完再补）；
- 一簇没有普通正文时 SHALL 原样返回，SHALL NOT 挂到配图或职能条目上。

#### Scenario: 渲染后句尾带职能且带色

- **WHEN** 簇的正文是「玩家进入房间时显示提示」「提示 3 秒后自动消失」，职能 `@GUI @程序`
- **THEN** 首条正文 SHALL 为 `玩家进入房间时显示提示 @GUI @程序`，第二条 SHALL 不变，`@GUI` / `@程序` 两个区间的字符颜色 SHALL 等于 `ROLE_COLORS`

#### Scenario: 同步幂等

- **WHEN** markdown 未变，对已渲染的蛋仔文档执行同步
- **THEN** `changes` SHALL 为空（计划侧按带后缀的文本比对）

#### Scenario: 没有正文

- **WHEN** 某簇只有配图条目、没有普通正文
- **THEN** 拼装 SHALL 不改动任何条目，职责由告警之外的其它渠道体现（不新增空行）
