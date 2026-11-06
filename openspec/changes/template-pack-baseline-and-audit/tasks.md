## 1. 基线包分发与查找顺序

- [x] 1.1 新增 `packages/figma-mcp-server/assets/packs/`：`default.json`（官方 1.14）+ `README.md`（含「不要手写」与重编流程）
- [x] 1.2 `resolvePackWithTrace` 追加两个候选：`bundled-project` → `bundled-default`，排在用户 `default.json` 之后；`PackCandidateOrigin` 扩展
- [x] 1.3 引擎根从 `import.meta.url` 推（`assets/packs`），测试可注入 `bundledDir`
- [x] 1.4 `<project>.json` 未命中时继续尝试 `default.json`；`GISOP_BUNDLED_PACKS=off` 可整组关闭
- [x] 1.5 单测：`tests/v2/template-pack-bundled.spec.ts` 7 条（命中 / 用户覆盖 / 项目覆盖 / 回落 / 轨迹 / off）

## 2. 两套基线包产出（依赖 Figma 真机）

- [ ] 2.1 补 `captureGeometryFromKeys` 透传：`sectionSourceId` / `sourceRootId` / `badgeSourceId`（现在是死参数），verify 路径也能采 `sectionShell` / `docBackground` / `bubbleGrid`
- [ ] 2.2 官方 1.14 重编：源模板 → `phase=compile` → 发布 → `phase=verify` → 覆盖 `assets/packs/default.json`（首版用的是现有 key + 已知 geometry，未重编）
- [ ] 2.3 蛋仔派对：同流程落 `assets/packs/蛋仔派对.json`（当前机器无该包）
- [ ] 2.4 两套包补齐 `placeholder` / `bubbleGrid` / `docPadding` / `footerGap`（本次已知缺失）
- [ ] 2.5 入库前用 `audit_template_pack` 跑一遍，findings 必须为空或全部为「可接受项」

## 3. key 失效错误码

- [x] 3.1 `instantiateByKey` 失败映射 `V2_TEMPLATE_KEY_STALE`，message 含 key / 用途 / 「phase=verify 重取」，`details.componentKey`
- [x] 3.2 单测：`tests/server/pack-audit-backend.spec.ts`（import 失败 → 专属码 + 文案）
- [x] 3.3 文档：`INSTALL.md` 与 `template-contract.md` 各一条

## 4. 后果自检（第一批两条）

- [x] 4.1 新增 `src/v2/pack-audit.ts`：`auditPackFields` / `auditRenderedContrast` / `auditTemplatePack` / `contrastMinFromEnv`
- [x] 4.2 C2：缺 `docBackground` 或 `sectionShell` → `W_PACK_GEOMETRY_DEFAULTED`（一条聚合，点名缺项与后果，明确写「这不是错误」）
- [x] 4.3 C1：后端 `auditTextContrast` 在插件侧做祖先链遍历 + WCAG 对比度；阈值 `GISOP_CONTRAST_MIN`（默认 3.0）
- [x] 4.4 跳过规则：`INSTANCE` 内部、无纯色填充文本、找不到实心祖先、隐藏节点；`skipReasons` 回传
- [x] 4.5 渲染收尾接入（parts 与 legacy 共用同一处）；**失败路径也带 `auditPackFields`**（零 RPC）
- [x] 4.6 单测：`tests/v2/pack-audit.spec.ts` 9 条（深浅底 / 聚合文案 / 阈值覆盖 / 跳过 / 自检失败不拖累）
- [x] 4.7 单测：完整包不告警、缺字段才告警（同文件）
- [x] 4.9 **0.4.5 返工**：对比度脚本把 TEXT 自身填充当背景 → 恒 `1.00:1` 假阳性（0.4.4 验收打出 98 条）。修 `nextBg` 只由非 TEXT 决定、比值用祖先 `bg`；脚本提成 `buildContrastAuditScript` 并加 `tests/server/contrast-audit-script.spec.ts`（用假 figma 树跑真脚本）
- [x] 4.10 **0.4.6 返工**：审计起点选错（从章节起走，看不到根帧 / 章节外框），叠加「无实心祖先整章跳过」→ 缺 geometry 的现场不报警（0.4.5 验收用例 B 第二条判据不可达）。修法：`auditTextContrast` 新增 `inheritedBackground`（章节外框内层 fill → docBackground → `#FFFFFF`），脚本 `walk(root, inherited)`；章节内实心底仍优先

## 5. 排查工具

- [x] 5.1 新增只读工具 `audit_template_pack`：`{ path?, project?, deep? }`
- [x] 5.2 返回 `{ ok, pack:{path,origin,project,components,capabilities,geometryPresent}, findings, skipped, keys? }`
- [ ] 5.3 `deep:true` 目前只做 key import 冒烟；**fingerprint 比对未做**（需要源模板文件与指纹能力，下一步补）
- [x] 5.4 无后端时 `deep` 返回 `V2_BACKEND_UNAVAILABLE` 而非崩溃；非 deep 纯本地可跑

## 6. 文档与版本

- [x] 6.1 `template-contract.md`：六级查找 + geometry 非必填说明 + `audit_template_pack`
- [x] 6.2 `docs/INSTALL.md`：「换机器 / 新同事」+ `V2_TEMPLATE_KEY_STALE` + 两条观感告警
- [x] 6.3 `SETUP.md`：基线包与切换方式（`GISOP_PROJECT` / 覆盖位置）、`GISOP_BUNDLED_PACKS=off`；切换 UX 仍后置
- [x] 6.4 `phase4-figma.md`：两条新告警的处理口径
- [x] 6.5 版本三处一致（引擎 0.4.4 / skill 2.4.3 / `^0.4.4`）+ `CHANGELOG.md` + `openspec/HANDOFF.md`

## 7. 回归

- [x] 7.1 `npx tsc -p tsconfig.json`
- [x] 7.2 `npx vitest run --no-file-parallelism`：83 files / 650 tests 全绿
- [ ] 7.3 真机：删掉项目包只靠 bundled-default 渲染成功且无 `W_TEXT_CONTRAST_LOW`
- [ ] 7.4 真机：去掉 `geometry` → 出现 `W_PACK_GEOMETRY_DEFAULTED`（+ 浅底时 `W_TEXT_CONTRAST_LOW`）
