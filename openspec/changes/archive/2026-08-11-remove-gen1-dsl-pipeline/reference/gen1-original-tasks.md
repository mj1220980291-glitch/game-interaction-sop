## 1. 项目骨架

- [x] 1.1 在仓库根创建 `figma-interaction-doc-engine/` 目录，添加 `package.json`（type: module, name: `figma-interaction-doc-engine`, bin 字段）
- [x] 1.2 添加 `tsconfig.json`（strict、ESM、target ES2022、moduleResolution NodeNext）
- [x] 1.3 添加依赖：`zod`、`js-yaml`、`@modelcontextprotocol/sdk`；devDeps：`typescript`、`vitest`、`@vitest/coverage-v8`、`playwright`、`tsx`、`@types/js-yaml`
- [x] 1.4 添加 `.gitignore`（node_modules、dist、runs/、e2e/diffs/、coverage）
- [x] 1.5 添加 `vitest.config.ts`（fixture 自动发现、coverage 阈值 90%）
- [x] 1.6 添加 `playwright.config.ts`（仅 chromium、本地 only、baseline 目录配置）
- [x] 1.7 创建源码目录结构：`src/{dsl,parser,planner,executor,checkpoint,server,templates}/index.ts`
- [x] 1.8 README 占位（仅一段说明，等实现完成后回填）

## 2. interaction-doc-dsl capability

- [x] 2.1 在 `src/dsl/schema.ts` 用 Zod 实现 `MetaSchema`、`AnchorSchema`（discriminated union）、`BubbleSchema`、`SectionSchema`、`ScreenshotSchema`、`DesignRefSchema`、`DocSchema`
- [x] 2.2 实现 `validate(yaml: string): { ok, errors?, ir? }`，错误对象含 `{ code, message, line, hint? }`
- [x] 2.3 定义错误码常量与中文消息表（`src/dsl/errors.ts`）
- [x] 2.4 单测：覆盖 spec 中的 7 个 scenario（缺失 meta、version 非法、URL 不安全、标题前缀、index 重复、anchor 互斥、layer 缺失/非法）
- [x] 2.5 单测：错误对象结构断言（每个错误都有 line 与 code）

## 3. dsl-parser capability

- [x] 3.1 在 `src/parser/markdown.ts` 用正则与简单状态机识别二级标题、Figma 链接、标注表、章节内图片
- [x] 3.2 实现 `parseMarkdown(md: string): ParsedIR`，输出可直接喂给 dsl validator 的对象
- [x] 3.3 标题前缀剥离规则（`^\d+\.\s*`、`^\d+、\s*`）+ 单测
- [x] 3.4 Figma URL nodeId 抽取（横线转冒号）+ 单测
- [x] 3.5 标注表解析 + 列数校验 + 单测
- [x] 3.6 输出确定性测试：对同输入两次 parse 结果 JSON 序列化相等

## 4. layout-planner capability

- [x] 4.1 在 `src/planner/coords.ts` 实现 FRAME-local 公式与 PAGE 直通逻辑 + 单测
- [x] 4.2 在 `src/planner/zorder.ts` 抽象 `insertChild(0, ...)` 指令生成器 + 单测
- [x] 4.3 在 `src/planner/screenshots.ts` 实现配图块数对齐策略（截断 / 占位 + warning）+ 单测
- [x] 4.4 在 `src/planner/template.ts` 实现 templateChoice 决策（design-driven / blank）+ 单测
- [x] 4.5 在 `src/planner/title.ts` 实现标题清洗（禁止子标题混入）+ 单测
- [x] 4.6 主入口 `plan(ir): PlanOutput`，组合上述模块，纯函数无副作用
- [x] 4.7 fixture 驱动：在 `tests/fixtures/` 加 3 个用例（部从卡牌、幻神槽位、最小用例）
- [x] 4.8 dry-run 可重复性测试

## 5. figma-executor capability

- [x] 5.1 在 `src/templates/` 编写原子模板：`cloneAndPlace.ts`、`fillText.ts`、`insertOverlay.ts`、`captureSnapshot.ts`，每个模板导出 `(params): string` 生成 JS
- [x] 5.2 实现 `executor.run(name, params)`：模板查表 + 参数注入 + 调用 figma_execute（通过 MCP client）
- [x] 5.3 实现克隆后 ID 重读封装（`cloneAndPlace` 模板内置 selection 返回）
- [x] 5.4 启动时 `figma_get_status` 体检逻辑 + `EXECUTOR_BACKEND_UNAVAILABLE` 错误
- [x] 5.5 调用日志结构（`report.executions`）
- [x] 5.6 模板源码 lint 测试：扫描 `src/templates/*.ts`，断言无 `appendChild`
- [x] 5.7 单测：用 fake figma_execute 客户端验证 cloneAndPlace 后 fillText 使用新 ID

## 6. engine-checkpoint capability

- [x] 6.1 在 `src/checkpoint/store.ts` 实现 `write(runId, phase, payload)` / `read(runId, phase)`，文件落 `runs/<runId>/phase-<n>-<name>.json`
- [x] 6.2 hash 链：每个 checkpoint 含 `prevHash` 指向上一 phase outputHash
- [x] 6.3 IR 漂移检测：replay 时对比当前 IR hash 与 phase-1 checkpoint 中的 hash
- [x] 6.4 错误码：`CHECKPOINT_BROKEN_CHAIN`、`CHECKPOINT_INPUT_DRIFT`
- [x] 6.5 单测：写读循环、链断裂、漂移检测三个场景

## 7. engine-mcp-server capability

- [x] 7.1 在 `src/server/index.ts` 用 `@modelcontextprotocol/sdk` 实现 Stdio Server
- [x] 7.2 注册 4 个工具：`validate_dsl`、`dry_run_layout`、`generate_interaction_doc`、`replay_from_checkpoint`
- [x] 7.3 实现 `generate_interaction_doc` 编排器：依次执行 7 phase，每 phase 后写 checkpoint
- [x] 7.4 实现 `replay_from_checkpoint`：复用前置 phase checkpoint，从 fromPhase 起执行
- [x] 7.5 统一错误响应（`{ code, message, hint? }`），全局 try/catch 兜底
- [x] 7.6 启动健康检查（warn 不阻塞）
- [x] 7.7 添加 `bin/figma-interaction-doc-engine.js` 启动脚本
- [x] 7.8 端到端手测：用 stdio 启动 server，发送 tools/list、validate_dsl、dry_run_layout，验证响应

## 8. engine-test-harness capability

- [ ] 8.1 配置 vitest coverage 阈值（line ≥ 90% for dsl/parser/planner）
- [ ] 8.2 fixture 加载工具：`tests/loadFixtures.ts` 自动发现 `fixtures/<case>/{input.yaml,expected-plan.json}`
- [ ] 8.3 模板 lint 测试入库 `tests/lint-templates.spec.ts`
- [ ] 8.4 Playwright 烟雾用例 1：部从卡牌 TIPS（含 baseline 截图）
- [ ] 8.5 Playwright 烟雾用例 2：幻神槽位重选（含 baseline 截图）
- [ ] 8.6 baseline 更新流程脚本：`pnpm test:e2e --update`
- [ ] 8.7 在 package.json scripts 中拆分 `test`（unit only）与 `test:e2e`

## 9. SKILL 同步与发布

- [x] 9.1 把 `C:\Users\miaochengming\.codex\skills\game-interaction-doc\SKILL.md` 备份为 `legacy/SKILL.v3.md`
- [x] 9.2 重写 v4 SKILL：~80 行，含 DSL 速查、5 个常见错误码、`generate_interaction_doc` 标准 prompt、deprecated 兜底说明
- [x] 9.3 同步更新 `h:\kk8项目文件\game-interaction-doc-kit\skill\SKILL.md`
- [x] 9.4 写「MCP 注册指南」`figma-interaction-doc-engine/docs/INSTALL.md`：CodeMaker 配置、figma-console 共启注意事项
- [x] 9.5 README 回填：定位、快速上手、与 figma-console-mcp 的关系图

## 10. 验收

- [ ] 10.1 用部从卡牌 Markdown 端到端跑一遍 generate_interaction_doc，结果与人工 v4 流程对比 0 视觉缺陷
- [ ] 10.2 用幻神槽位 Markdown 端到端跑一遍，结果对比通过
- [ ] 10.3 制造一处中途失败，验证 replay_from_checkpoint 可恢复
- [ ] 10.4 制造非法 DSL，验证 validate_dsl 给出可执行的修正建议
- [ ] 10.5 运行 `pnpm test`：全绿，coverage 达标
- [ ] 10.6 关闭 figma-console-mcp，确认 validate_dsl / dry_run_layout 仍可用，generate 给出明确 EXECUTOR_BACKEND_UNAVAILABLE
- [ ] 10.7 把本 change 列入 ready-to-archive 列表
