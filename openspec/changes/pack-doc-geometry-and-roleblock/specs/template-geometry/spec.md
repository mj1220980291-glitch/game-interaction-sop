## ADDED Requirements

### Requirement: 编译期采集文档级留白

编译（`phase=compile`）与回填（`phase=verify`）SHALL 从原稿采集三项「部件之外、文档之内」的留白并写入模板包 `geometry`：

- `docPadding`：原稿文档根节点的内边距（四个方向，允许为 0）
- `rootGap`：原稿同级块（顶部 / 总览 / 章节 / 结尾）之间的间距
- `footerGap`：结尾块之前的留白高度（原稿用实心空 FRAME 表达时取其高度）

采集口径 SHALL 只用结构信息（padding / 纯色填充 / 同级 y 距离），不依赖图层命名。

量不到时 SHALL 在报告 `gaps` 里逐项点名，说明字段、后果（内容贴边 / 块与块紧贴 / 结尾不留白）与修法；SHALL NOT 用默认值静默填充。

#### Scenario: 留白画在文档根的模板

- **WHEN** 原稿文档根 `padding = {top:0,right:60,bottom:0,left:60}`，同级章节间距 60，结尾前留白块高 200
- **THEN** 包内 `geometry` SHALL 含 `docPadding {0,60,0,60}`、`rootGap 60`、`footerGap 200`

#### Scenario: 留白为 0 的模板

- **WHEN** 原稿文档根无内边距、同级块无间隙、结尾前无留白
- **THEN** 三项 SHALL 写为 0（或省略），且 SHALL NOT 产生 gaps

#### Scenario: 看不到原稿根

- **WHEN** `phase=verify` 且调用方没有给出原稿根节点
- **THEN** 报告 `gaps` SHALL 含一条点名「缺原稿文档根」的记录，说明后果为「文档级留白按 0 处理」
