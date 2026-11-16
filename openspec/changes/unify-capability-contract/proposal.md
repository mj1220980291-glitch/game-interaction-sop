## Why

2026-11-16 旧稿清洗验收时撞到一个自相矛盾：`mdContract` 写「`roleAnnotation=none` 时不写 `@职能`」，解析器却强制每簇首行 `@角色`，只能加回 `@角色` 才渲染通过。

根因不是这一处漏判，而是**同一套「能力 → 行为」知识散落在多个模块**：8 项能力在 10 个文件里有 36 处 `=== 'x'` 分支（解析闸门 2 处、契约文案 8 处、渲染行为约 20 处、编译/归一化/对账若干）。历史上有过同类漏判：解析期只给 `inline-suffix` 开了豁免，`none` 没开；`overview` 也只给 `none` 开豁免。

后果：**每接入一个新模板（新能力取值组合），都要靠人记得把每一处分支补齐**；漏一处就表现成「契约这么写、引擎不接受」或「渲染结果与契约不符」。这类问题已经在两套模板上各出现一次。

## What Changes

- 新增单一事实来源 `src/v2/capability-contract.ts`：对 8 项能力的每个取值声明三类规则
  1. `md`：markdown 允许/禁止/可选的写法（供解析器闸门）
  2. `contract`：书写契约文案（供 `md-contract` 生成）
  3. `render`：渲染期行为开关（是否消费某段 IR、是否要求某槽位、标号数量口径等）
- **穷尽类型**：表用 `Record<CapabilityKey, Record<Value, Rule>>`；枚举加值而不补表 → `tsc` 报错。
- **表驱动测试**：遍历枚举与表，断言三方一致（契约说必须 ⟺ 解析器强制 ⟺ 渲染消费）；新取值自动进入测试。
- **运行时自检**：pack 加载/渲染入口按表推导期望，与契约、解析规则比对，不一致给一条诊断（软警告，不崩），把「写错」从真机前移到加载时。
- 迁移消费者：`parser.ts`、`render.ts`、`md-contract.ts`、`render/parts/index.ts`、`render/parts/geometry.ts`、`compile/normalize-slots.ts`、`compile/slim-parts.ts`、`compile/index.ts`、`reconcile/index.ts` 改为读表，而不是各自 `===` 判断。
- 顺带修复当前 bug：`roleAnnotation=none` 时 `@角色` 行可选（不写不报错，写了忽略）。

## Capabilities

### New Capabilities

- `capability-contract`：能力取值到 markdown 规则、契约文案与渲染行为的唯一映射表，及一致性校验。

### Modified Capabilities

- `markdown-v2-contract`：解析闸门 SHALL 由能力表推导，不得在解析器里硬编码单一模板形状。

## Impact

- 新增 `packages/figma-mcp-server/src/v2/capability-contract.ts` 与其测试
- 改动：`v2/parser.ts`、`v2/render.ts`、`v2/compile/md-contract.ts`、`v2/render/parts/index.ts`、`v2/render/parts/geometry.ts`、`v2/compile/normalize-slots.ts`、`v2/compile/slim-parts.ts`、`v2/compile/index.ts`、`v2/reconcile/index.ts`
- 模板包不变（`template.json` 形状不动），只改引擎内部消费方式
- 不在范围：新增能力项本身、清洗流程（`add-legacy-template-cleaning`）、渲染视觉调整
