## Why

蛋仔包声明 `capabilities.roleAnnotation = 'inline-suffix'`：这类模板没有「职能标记」组件位，职能以 `@GUI @程序` 的形式跟在**正文句尾**，并且在 Figma 里是带色的字。引擎此前只实现了 `component-variant`，0.3.7 起改为发 `V2_W_ROLE_ANNOTATION_UNSUPPORTED` 告警——但职能仍然没写进文档，蛋仔无法投产。

## What Changes

- 新增 `role-suffix` 拼装：把簇的职能拼到**第一条普通正文**句尾（跳过配图条目与 `@职能` 条目）
- 渲染：`inline-suffix` 模板填充前先拼装，写完由既有 `paintRoleTokens` 按 `ROLE_COLORS` 上色
- 同步：`expectedItems` 增加 `inlineRoles`，按同一份文本比对（否则每次同步都以为条目被改过、来回重写）；`planReconcile` 从模板包能力取该开关
- 移除 `V2_W_ROLE_ANNOTATION_UNSUPPORTED` 的发射（能力已实现）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-render`: 「模板能力未实现时 SHALL 告警」→ 改为「`inline-suffix` 职能 SHALL 拼在正文句尾并上色」；能力缺失告警规则保留给未来其它能力。

## Impact

- 新增 `packages/figma-mcp-server/src/v2/role-suffix.ts`
- `v2/render/parts/index.ts`（填充前拼装）
- `v2/reconcile/{layout,plan,index}.ts`（同步同口径）
- 测试：`tests/v2/role-inline-suffix.spec.ts` 重写为「句尾拼接 + 上色 + 同步口径」
- 引擎 `0.3.9` → `0.4.0`
