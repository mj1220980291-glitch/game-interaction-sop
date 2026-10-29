## Why

编译瘦身只认「名字」，不认「槽位段（run）」：它把簇里第二个 `#Title` 及其内容当成多余内容行整批删掉，把配图 GROUP 拍平成矩形并丢掉占位文案，还漏掉第二个职能标签帧。渲染端却按 run 逐段组装。两端对同一个簇的形状理解不一致，`官方1.14` 因此连续两次重编产出坏部件（配图无占位文案、正文从 ×2 变 ×1、第二组小标题消失、孤儿职能帧留在产物里）。

根因是 `run` 这个概念只活在渲染端私有函数 `splitSlotRuns`（`src/v2/render.ts:1720`），编译端完全不知道它的存在。

## What Changes

- 新增共享模块 `src/v2/template/runs.ts`：`splitRuns()` 作为 run 边界的**唯一**规则，编译、渲染、同步三端共用；同时给出 run 成员分类（分组标题 / 职能标签 / 正文 / 配图）。
- 编译瘦身改为 run 感知：保留**第一个完整 run**，其余 run 连根整删；run 内条目数量保持模板原样（不再按名字全局裁到 1 条）。
- 配图槽形态统一：编译产物里的 `配图` **一律是 GROUP**，内含 `配图占位` 矩形 + `配图占位文案` TEXT。模板原本是裸矩形的（如蛋仔类），编译期包壳补齐。
- 两段式 run 契约探针：写画布前对原稿簇做可识别性预检（失败则一个节点都不建）；瘦身后对产物簇做不变量校验（认不出 run / run 内没有正文 / 配图不是 GROUP）→ **硬失败**，报 `V2_COMPILE_RUN_CONTRACT_BROKEN`，不回填 key，报告列出待清理的组件 id。
- 渲染填充改用共享 `splitRuns()`；职能标签 FRAME 保持整簇唯一（第一 run），渲染后多余职能帧 SHALL 被删除。
- `1:14` 的两段 run 形状固化为 fixture 单测；重编 `官方1.14`、发布、回填 key，并用测试 md 真机渲染对比。
- **BREAKING**（仅对编译产物形态）：`配图` 不再是裸矩形，旧渲染逻辑的「裸槽」分支只保留给尚未重编的旧包。

## Capabilities

### New Capabilities
- `slot-run-contract`: 槽位段（run）的边界、成员构成与编译/渲染两端的不变量，以及违反时的硬失败要求。

### Modified Capabilities
- `template-compile`: 瘦身按 run 裁剪；配图槽统一 GROUP 化；run 契约探针纳入编译期校验；重编流程不变。
- `figma-template-1-14-rendering`: 槽位段边界改为共享规则；配图只克隆 GROUP；职能标签帧整块唯一且多余者被删。

## Impact

- 新增 `packages/figma-mcp-server/src/v2/template/runs.ts`
- 编译：`compile/slim-parts.ts`（媒体与条目裁剪）、`compile/normalize-slots.ts`（职能帧全量归一）、`compile/index.ts`（探针接入）、`compile/errors.ts`（新错误码）
- 渲染：`src/v2/render.ts`（`fillGroupSlots` / `splitSlotRuns`）、`src/v2/reconcile/layout.ts`（分类复用共享模块）
- 后端：`src/v2/figma-client.ts` + `src/server/figmaConsoleBackend.ts` 新增 `groupNodes` 与 `createText`（编译期给裸矩形配图包壳并补占位文案）
- 测试：`tests/v2/helpers/slots-backend.ts` 补齐新方法；新增 run 形状 fixture 与 slim/render 回归用例
- 模板：`官方1.14` 重编 + 人工发布 + key 回填 + 真机渲染对比
