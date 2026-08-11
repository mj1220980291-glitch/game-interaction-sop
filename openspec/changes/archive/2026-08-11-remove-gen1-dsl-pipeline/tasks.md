## 1. 留档（删除前必须完成）

- [x] 1.1 `src/checkpoint/index.ts` → `reference/checkpoint-index.ts.txt`
- [x] 1.2 `src/server/pipeline.ts` → `reference/pipeline.ts.txt`
- [x] 1.3 `src/executor/index.ts` → `reference/executor-index.ts.txt`
- [x] 1.4 旧仓库原始 design.md / tasks.md → `reference/gen1-original-{design,tasks}.md`
- [x] 1.5 `reference/README.md` 写明一代是什么、为何放弃、checkpoint 为何值得留

## 2. 源码删除

- [x] 2.1 删除 `src/dsl/`
- [x] 2.2 删除 `src/parser/`
- [x] 2.3 删除 `src/planner/`
- [x] 2.4 删除 `src/executor/`
- [x] 2.5 删除 `src/checkpoint/`
- [x] 2.6 删除 `src/templates/`
- [x] 2.7 删除 `src/server/pipeline.ts`
- [x] 2.8 `src/index.ts` re-export 收敛为 `export * as v2`

## 3. Server 层收敛

- [x] 3.1 `createServer.ts` 移除 `validate`/`plan`/`CheckpointStore`/`Executor`/`runPipeline` 五个 import
- [x] 3.2 移除 4 个 NativeToolDef 及 `YAML_INPUT_SCHEMA`/`GENERATE_INPUT_SCHEMA`/`REPLAY_INPUT_SCHEMA`
- [x] 3.3 工具返回数组收敛为 `[validateV2Markdown, renderV2MarkdownTool]`
- [x] 3.4 移除 `EXECUTOR_BACKEND_UNAVAILABLE` 错误码与 `generateRunId()`；`CreateServerOptions` 去掉 `backend` / `storeRoot`
- [x] 3.5 `src/server/index.ts` banner 更新为 2 个原生工具；`createServer.ts` 顶部注释同步

## 4. 测试调整

- [x] 4.1 删除 8 个一代测试文件
- [x] 4.2 删除 `tests/fixtures/`
- [x] 4.3 `tests/server.spec.ts` 重写：改用 `tests/v2/fixtures/buzhong.md`，断言恰好 2 个工具 + 一代工具不存在 + `V2_BACKEND_UNAVAILABLE` gating
- [x] 4.4 `tests/proxy.spec.ts` 三处样本工具名 `validate_dsl` → `validate_v2_markdown`
- [x] 4.5 新增断言：一代工具名不出现在注册表中

## 5. 配置与依赖

- [x] 5.1 `package.json` 移除 `lint:templates` 与 `test:e2e` 脚本
- [x] 5.2 移除 `js-yaml` / `@types/js-yaml` 依赖（源码零引用）
- [x] 5.3 移除 `zod` 依赖（源码零引用）
- [x] 5.4 移除 `playwright` 依赖与 `playwright.config.ts`（`e2e/` 目录本就不存在）
- [x] 5.5 `vitest.config.ts` coverage include 改为 `src/v2/**`
- [x] 5.6 `exports` 字段收敛为 `.` 与 `./v2`

## 6. 文档

- [x] 6.1 重写 `packages/figma-mcp-server/README.md` 为三代实际形态
- [x] 6.2 README 工具表改为 2 个原生工具 + 代理转发说明
- [x] 6.3 README 项目结构改为 `src/{v2,server}`，并加一段一代移除的 History 说明
- [x] 6.4 重写 `docs/INSTALL.md`（原文通篇为一代 YAML DSL 内容，且指向旧仓库路径）
- [x] 6.5 `openspec/specs/engine-mcp-server/spec.md` 同步：新增「引擎对外工具集」Requirement，修正 tools/list 场景里的工具枚举

## 7. 验证

- [x] 7.1 `npx tsc -p tsconfig.json --noEmit` 零错误
- [x] 7.2 全量测试 52 passed / 6 files，全部属于三代路径（原 142 中 88 个一代测试已移除）
- [x] 7.3 `node dist/server/index.js` 正常启动
- [x] 7.4 实测 stdio `tools/list` 恰好返回 `validate_v2_markdown` + `render_v2_markdown_to_figma`
- [x] 7.5 端到端：用既有文档跑一遍 Phase 4，产物与本 change 前一致
  - 2026-08-11 实测：`tests/v2/fixtures/buzhong.md` → `render_v2_markdown_to_figma`（`target.fileKey=UYCJok3MXTWITMfeJSqEF6`）
  - 返回 `ok:true`，`sectionCount:2 / clusterCount:3 / bubbleCount:3 / imagesPlaced:0 / placeholdersUsed:2`，零 errors 零 warnings
  - 截图核对：章节标题、序号气泡、`@角色` 配色、说明块正文分段、配图与主图占位均正常
  - 验证后已删除产物，`模板` 页恢复为仅含 `模板(1:14)`
