## 1. Parser 改动

- [ ] 1.1 在 `parseClusters` 函数签名加 `opts?: { stripH4?: boolean }` 参数（默认 `true`）
- [ ] 1.2 在 cluster body 行扫描的 else 分支前，加 `if (opts?.stripH4 !== false && /^\s*####/.test(t)) continue;` 跳过 `####` 行
- [ ] 1.3 确认改动不影响正常 bullet（`- xxx`）和普通正文行的处理路径

## 2. 测试 Fixture + 用例

- [ ] 2.1 新建 `packages/figma-mcp-server/tests/fixtures/h4-strip.md`：含 1 个 `###` 簇，内有 2 个 `####` 分组、共 5 条真实 bullet
- [ ] 2.2 在 `packages/figma-mcp-server/tests/parser.spec.ts`（或同级新文件）增加用例：`#### 行不出现在 bullets[]`
- [ ] 2.3 增加 edge 用例：只有 `####` 无真实 bullet → `bullets === []`
- [ ] 2.4 增加用例：`stripH4: false` 时 `####` 字面量出现在 `bullets[]`（验证 flag 反转）
- [ ] 2.5 确认 buzhong.md 等现有 fixture 测试仍全绿（无回归）

## 3. 验证 + 提交

- [ ] 3.1 `pnpm test` 全绿
- [ ] 3.2 用 `选秀环节_交互文档.md` 做手动渲染冒烟：确认 bullet 文本里不再出现 `#### xxx` 字面量
- [ ] 3.3 `git commit` + `git push`
