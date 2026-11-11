## ADDED Requirements

### Requirement: 职能标签配置随模板包分发

`TemplatePack` SHALL 支持可选字段 `roleBlock`：

```
roleBlock?: {
  variantKeys?: Record<string, string>;   // 角色 -> 已发布变体 key
  componentSetId?: string;
  variantPrefix?: string;
  labelTextName?: string;
}
```

解析优先级 SHALL 为：**模板包 `roleBlock` > 用户配置（`~/.game-interaction-sop/template.json`）> 无**。两者都没有且 md 含 `@职能` 时，SHALL 保持现有错误/告警文案不变。

字段缺失 SHALL 与本变更前行为一致（不要求所有包都带）。

#### Scenario: 包内配置优先

- **WHEN** 模板包带 `roleBlock.variantKeys`，用户配置里另有不同 key
- **THEN** 渲染 SHALL 使用包内的 key，并在返回体 `resolvedRoleBlock` 里标明来源为包

#### Scenario: 包内没有时退回用户配置

- **WHEN** 模板包无 `roleBlock`，用户配置里有 `variantKeys`
- **THEN** 行为 SHALL 与本变更前完全一致（使用用户配置）

### Requirement: 观感告警按「信息是否已表达」判定

`audit_template_pack` 与渲染期观感自检 SHALL 在「文档级留白已表达」时不再提示 `sectionShell` 缺失：

- 判据：`geometry.docPadding` 存在且非全 0，或 `docBackground`（根填充）已表达文档底色
- `sectionShell` 告警 SHALL 只在「既无章节外壳、又无文档级留白」时出现

三项留白（`docPadding` / `rootGap` / `footerGap`）在模板确有留白而包内缺失时 SHALL 点名，话术与 `sectionShell` 同风格（说明现象、后果、修法）。

#### Scenario: 黑边画在文档根的模板

- **WHEN** 包内 `geometry.docPadding = {0,60,0,60}`，无 `sectionShell`
- **THEN** 体检 SHALL NOT 输出 `V2_W_PACK_GEOMETRY_DEFAULTED`

#### Scenario: 章节壳型模板

- **WHEN** 包内 `sectionShell` 完整（如官方 1.14 的两层 64 padding）
- **THEN** 行为 SHALL 与本变更前一致（不告警）
