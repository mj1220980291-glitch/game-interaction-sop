## ADDED Requirements

### Requirement: 渲染后 SHALL 做观感后果自检

渲染完成（或失败但产物已部分落地）后，引擎 SHALL 对产物做一次只读的后果自检，SHALL NOT 因自检结果改变渲染结论、SHALL NOT 阻断渲染。

自检 SHALL 只依据产物与 pack，SHALL NOT 要求 pack 包含任何特定字段（不同模板结构可不同）。

#### Scenario: 自检不影响 ok

- **WHEN** 自检产生任意条警告
- **THEN** 返回体 `ok` 仍为 `true`，`warnings` 追加对应条目

#### Scenario: 两条渲染路径都接

- **WHEN** 分别走 parts 路径与 legacy 路径渲染
- **THEN** 两条路径 SHALL 都执行同一套自检

### Requirement: 正文对比度 SHALL 以软告警暴露

引擎 SHALL 计算正文文本节点填色与其最近「有实心填充」祖先填色的对比度；当对比度低于阈值时 SHALL 输出软告警 `W_TEXT_CONTRAST_LOW`。

阈值 SHALL 默认 3.0，可由 `GISOP_CONTRAST_MIN` 覆盖。

告警 SHALL 按章节聚合（一条含章节名、低于阈值的条目数、文字色与背景色），SHALL NOT 逐条输出。

以下情形 SHALL 跳过且 SHALL NOT 产生告警：背景为渐变或图片填充、文本位于 `INSTANCE` 内部、文本无纯色填充、找不到任何实心祖先。

#### Scenario: 浅字压浅底

- **WHEN** 正文文字为 `#EEEEEE`，最近实心祖先为 `#FFFFFF`，阈值 3.0
- **THEN** 该章 SHALL 产生一条 `W_TEXT_CONTRAST_LOW`，含两侧颜色

#### Scenario: 深底浅字

- **WHEN** 正文文字为 `#EEEEEE`，最近实心祖先为 `#161616`
- **THEN** SHALL NOT 产生该告警

#### Scenario: 图片底不做判断

- **WHEN** 文本所在区域最近的有填充祖先为 IMAGE 填充
- **THEN** SHALL 跳过，且在返回的诊断里记为 skipped（原因可读）

### Requirement: 观感字段缺省 SHALL 可观测

当本次使用的 pack 缺少 `docBackground` 或 `sectionShell` 时，渲染 SHALL 输出一条聚合软告警 `W_PACK_GEOMETRY_DEFAULTED`，message SHALL 点名缺哪项以及后果（例如「文档底色用默认白」「章节缺外框，黑边与卡片底色会缺」）。

该告警 SHALL 只在字段确实缺失时出现；字段存在时不 SHALL 输出。

#### Scenario: 缺 docBackground 与 sectionShell

- **WHEN** pack 只有 components，没有 `geometry`
- **THEN** 返回 `warnings` SHALL 含一条 `W_PACK_GEOMETRY_DEFAULTED`，且 message 同时点名两项

#### Scenario: 完整包

- **WHEN** pack 含 `geometry.docBackground` 与 `geometry.sectionShell`
- **THEN** SHALL NOT 出现该告警

### Requirement: 基线包 key 失效 SHALL 用专属错误码

当 pack 里的库组件 key 无法被 import（库重新发布导致 key 变更）时，渲染 SHALL 返回 `V2_TEMPLATE_KEY_STALE`，message SHALL 含 `part` / `key` / pack 路径 / 「用 phase=verify 重取 key」。

SHALL NOT 将其表现为 `Cannot connect`、节点不存在或模板包缺失。

#### Scenario: 基线包 key 过期

- **WHEN** 用引擎包内基线包渲染，chapter key 已失效
- **THEN** 返回 `V2_TEMPLATE_KEY_STALE` 且不再尝试其他模板来源
