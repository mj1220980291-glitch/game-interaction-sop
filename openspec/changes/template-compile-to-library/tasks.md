## 1. 前置确认（写代码前完成）

- [x] 1.1 库文件已定：`交互SOP模板库` / `fileKey = jQf7zj33pzOGsGKO4d73OO` / 页面 `Page 1`
- [x] 1.2 发布权限已验：冒烟组件发布成功，从 `Agent草稿`（`UYCJok3MXTWITMfeJSqEF6`）`importComponentByKeyAsync` 取件成功，首次 7.2s。踩坑：组件名以 `_` 开头时 Figma 判定「不发布」（Publish 弹窗落 `Hidden`）
- [x] 1.3 确认 `Noto Sans SC` 可加载：实测仅 `Regular` / `Medium` / `Bold` 三档（无 Light / Black）→ 映射表只在这三档内选

> 1.2 / 1.3 任一不通过，本变更停在文档阶段，不写代码。

## 2. 编译 SOP 文档

- [ ] 2.1 新增 `packages/skill/references/template-compile.md`：人工粘贴那一步的操作说明（粘到 `_staging` 页、保持原名、粘哪些块）、两段式发布流程、key 回填、重编纪律
- [ ] 2.2 `packages/skill/references/template-contract.md` 补「归一化模板归属」一节（引用本变更 `template-contract` delta）
- [ ] 2.3 `packages/skill/phases/phase4-figma.md`：探针 `ready` 之后增加分支——无 `template.json` 时提示编译

## 3. 后端能力补齐

- [x] 3.1 `FigmaBackend` 增加可选方法：`createComponentFromNode`、`combineAsVariants`、`setPluginData`、`renameNode`、`readComponentKey`、`importComponentByKey`
- [x] 3.2 `figmaConsoleBackend.ts` 实现上述方法（`figma_execute` 内联脚本，沿用 `SERIALIZE_NODE_FN`）；`importComponentByKey` 超时 40s。真机已验证：FRAME→COMPONENT（id 变）、两组件合成 `COMPONENT_SET`、`gisop` plugin data 往返、`key` 可读（临时页已删）
- [x] 3.3 补单测：detach 后返回新 id、类型变 FRAME
- [x] 3.4 `readComponentKey`：非组件 / 无 key / 节点不存在一律返回 `null` 不抛错；代码注释写明「key 非空 ≠ 已发布」

## 4. 干跑：粘贴后的核对

- [ ] 4.1 新增 `src/v2/compile/intake.ts`：核对 `_staging` 页上 4 个部件是否齐全、母版结构特征是否与探针记录吻合、收编零件清单是否齐
- [ ] 4.2 缺口逐条输出（缺哪个部件 / 缺哪个零件 / 哪个部件结构对不上），不猜不补
- [ ] 4.3 单测：少一个部件 → 报缺口；零件缺失 → 报缺口；齐全 → 无缺口

## 5. 部件生成

- [x] 5.1 部件来源改为 `_staging` 页上人工粘贴的节点；探针给出的母版位置只用于**核对**（见第 4 组），不参与切分
- [x] 5.2 `src/v2/compile/parts.ts`：`planParts`（干跑）+ `buildParts`（克隆 → 实例则先 detach → `createComponentFromNode` → 打 `part` / `project` 锚点），命名 `<项目> / 顶部|章节|簇|结尾`
- [x] 5.3 `footer` 缺失时不建组件、记一条缺口（`components.footer` 写 `null` 见 10.2）
- [x] 5.4 单测：缺 footer → 3 步 + 1 缺口；缺 chapter → 拒绝；版本后缀；`_` 前缀拒；实例先 detach；后端缺方法 → 明确拒绝（`tests/v2/compile-parts.spec.ts`，8 例）
- [x] 5.5 `src/v2/compile/font-normalize.ts`（映射表 + `mapFontStyle`）+ 后端 `normalizeFontsInSubtree`（按 `getStyledTextSegments` 分段改 `fontName`，不动字号 / 行距 / 字间距 / 字色 / 对齐）
- [x] 5.6 单测：`U5Font` → `Noto Sans SC`；`Light` → `Regular`、`SemiBold` → `Medium` 且记缺口；已是目标字体零写入（`tests/v2/compile-font.spec.ts`，7 例）
- [x] 5.7 `src/v2/compile/badge-container.ts`：`ensureBadgeContainer` 从 `1:14` 的 `气泡` 克隆空容器，命名 `气泡`，打 `role: badgeSlot`；无来源只记缺口；摆位不计算
- [x] 5.8 单测：自带容器不动；无来源零写入 + 缺口；有来源克隆并打锚点（`tests/v2/compile-badge.spec.ts`，3 例）

## 6. 收编（adopt）

- [ ] 6.1 新增 `src/v2/compile/adopt.ts`：递归扫部件内的 `INSTANCE`，逐个 `detachInstance` → `createComponentFromNode`
- [ ] 6.2 原组件是组件集时：`combineAsVariants` 重建，逐个还原变体名，并与原变体名逐项比对，不一致即拒绝
- [ ] 6.3 父部件中把该位置替换为本库组件实例（同库 `createInstance`，不走 `import`）
- [ ] 6.4 发布顺序：先零件、后部件（由编排层保证，`parts.ts` 不直接发）
- [ ] 6.5 收编后校验：部件内不存在任何指向外部文件 key 的实例
- [ ] 6.6 单测：`num` 三角 → 变成本库组件且内文本可写；变体集 → 变体名逐项一致；残留外部引用 → 报错

## 7. 锚点

- [ ] 7.1 新增 `src/v2/compile/anchor.ts`：`setSharedPluginData('gisop', 'part'|'role'|'adopt'|'source', …)`
- [ ] 7.2 降级链：plugin data 写入失败 → 约定图层名 → 不可见零高度 FRAME（`#anchor:<role>`）
- [ ] 7.3 生成 `anchors` 字段：只写降级项，plugin data 项不写
- [ ] 7.4 单测：三档降级各一例；`anchors` 只含降级项

## 8. 产物探针与能力重算

- [ ] 8.1 新增 `src/v2/compile/verify-capabilities.ts`：对 4 个产出部件调用现有 `probeFromTree` / `probeTemplate`
- [ ] 8.2 产物能力覆盖源能力；逐项差异写进 `gaps`
- [ ] 8.3 单测：`instance → text` 场景产出差异条目；无差异时不产出噪声条目

## 9. 前置校验与拒绝路径

- [ ] 9.1 `src/v2/compile/preflight.ts`：库文件可写、字体可加载、源指纹一致、能力可表达
- [ ] 9.2 错误码：`V2_COMPILE_LIBRARY_UNWRITABLE` / `V2_COMPILE_FONT_UNAVAILABLE` / `V2_COMPILE_SOURCE_DRIFT` / `V2_COMPILE_CAPABILITY_UNEXPRESSIBLE` / `V2_COMPILE_NOT_PUBLISHED`
- [ ] 9.3 字体校验只看 `Noto Sans SC` 各字重；失败列出缺失字重
- [ ] 9.4 单测：四种拒绝各一例；拒绝后库里零新增节点

## 10. 发布回填与重编

- [ ] 10.1 `src/v2/compile/backfill.ts`：`verify` 阶段读 4 个组件 key；任一缺失 → `V2_COMPILE_NOT_PUBLISHED`，不写部分 key
- [ ] 10.2 写 `<项目根>/.interaction-sop/template.json`，结果必须能过 `parseTemplatePack`
- [ ] 10.3 重编：新组件名带版本后缀，旧组件标 `gisop.deprecated = true`，不删不原地改
- [ ] 10.4 单测：未发布 → 报错且不改文件；已发布 → 文件可解析；重编 → 旧组件仍在
- [ ] 10.5 `verify` 用**真 import 冒烟**：在非库文件里逐个 `importComponentByKeyAsync`，单次预算 ≥ 30s；只读到非空 key 不算已发布
- [ ] 10.6 命名红线校验：部件与收编零件的名字不得以 `_` 或 `.` 开头（否则 Figma 归入「不发布」）

## 11. MCP 工具

- [ ] 11.1 `src/v2/compile/index.ts` 导出 `compileTemplate({ phase, source, library, project, samples?, parts?, write?, backend })`
- [ ] 11.2 `createServer.ts` 注册 `figma_compile_template`（写入类，`write` 缺省 `false`），更新 `server.spec.ts` 工具清单断言
- [ ] 11.3 `write: true` 前 `commitUndoCheckpoint`
- [ ] 11.4 报告结构：`phase` / `created` / `adopted` / `anchors` / `capabilities` / `gaps` / `checks` / `templateJson` + 人读版

## 12. 验证（真机）

- [ ] 12.1 `npm run build --prefix packages/figma-mcp-server`；`npm test` 全绿（`--no-file-parallelism`）
- [ ] 12.2 `1:14`：干跑 → 实跑 → 发布 → `verify` 回填；产物探针 SHALL 全绿且能力全缺省
- [ ] 12.3 `798:17608`：人工粘贴 → 干跑核对 → 实跑（含收编「标签」组件集 + `num` 三角）→ 发布 → `verify`
- [ ] 12.4 `798` 收编校验：删除源模板中「标签」组件集后，用产物 key 导入 → 图例正常、无占位
- [ ] 12.5 `796:12489` 压力核对：只读母版子树，不触发全文档扫描
- [ ] 12.6 只读证明：三次执行前后 `1:14` / `798` / `796` 源模板指纹完全一致
- [ ] 12.7 `openspec validate template-compile-to-library --strict` 通过
