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

- [x] 6.1 后端 `adoptInstances({rootId, partsPageId, project})`：单次 `figma_execute` 内递归扫 `INSTANCE`（不钻入实例内部），最多 6 轮（拆一层可能露出新的实例）
- [x] 6.2 每个实例：`detachInstance` → `createComponentFromNode` → 建议原位的自有实例；组件移到库的零件页；`ours[]` + 零件页双重护栏防自我重拆
- [x] 6.3 组件集：按原组件集名分组 → `combineAsVariants` 重组 → 集名 `<项目> / 零件 / <原集名>`；成员保留原组件名（变体属性靠它解析）
- [x] 6.4 发布顺序：先零件、后部件（`adoptNestedParts` 只产出组件，发布由编排层在部件之后统一做）
- [x] 6.5 收编后自检：`unresolved` 非空即视为未通（`isFullyAdopted`）
- [x] 6.6 单测：两变体实例 → 自有组件 + 组件集重建 + 原位换自家实例（`compile-adopt-backend.spec.ts`，1 例）；聚合/变体名不合规/有残留/后端不支持（`compile-adopt.spec.ts`，4 例）

## 7. 锚点

- [x] 7.1 `src/v2/compile/anchor.ts`：`applyPluginDataAnchors` 写 `role:<role>`，`part` / `project` 在 `parts.ts` 里写；后端缺 `setPluginData` 时明确报错而非静默
- [x] 7.2 降级链三档：plugin data → `nameAnchorSpec(图层名)` → `createInvisibleAnchorSpec`（后端新增 `createInvisibleAnchor`，建不可见 1×1 FRAME `#anchor:<role>`）
- [x] 7.3 `mergeAnchorSpecs`：只保留降级项，plugin data 已覆盖的槽位不写配置
- [x] 7.4 单测：plugin data 优先 / 空输入零写入 / 后端不支持报错 / 不可见锚点 / 降级项过滤（`compile-anchor.spec.ts`，5 例）

## 8. 产物探针与能力重算

- [x] 8.1 `src/v2/compile/verify-capabilities.ts`：用现有 `probe/detect.ts` 的判定函数（`detect` / `detectOverview` / `detectRoleHabit` / `detectColumn` / `detectFigure` / `detectHiddenPool`）重算，不另写一套
- [x] 8.2 产物能力覆盖源能力；逐项差异 + 「无法实测项」都写进 `gaps`，不静默
- [x] 8.3 单测：差异逐项比对、无差异不产噪声、无证据时沿用源值并记缺口（`compile-verify-capabilities.spec.ts`，5 例）

## 9. 前置校验与拒绝路径

- [x] 9.1 `src/v2/compile/preflight.ts`：后端能力齐备、库落点是 PAGE、源指纹一致、差异可表达（四条任一失败即拒绝且不写画布）
- [x] 9.2 错误码集中在 `src/v2/compile/errors.ts`：`V2_COMPILE_LIBRARY_UNWRITABLE` / `FONT_UNAVAILABLE` / `SOURCE_DRIFT` / `CAPABILITY_UNEXPRESSIBLE` / `NOT_PUBLISHED` / `STAGED_PART_MISSING` / `UNPUBLISHABLE_NAME` / `BACKEND_UNSUPPORTED`
- [x] 9.3 字体侧改为**归一化**：只校验 `Noto Sans SC` 三档字重；项目字体缺失不再阻断（`normalizeFontsInSubtree` 会报不可用字重）
- [x] 9.4 单测：四种拒绝各一例（`compile-preflight-backfill.spec.ts`）

## 10. 发布回填与重编

- [x] 10.1 `src/v2/compile/backfill.ts` 的 `verifyPublished`：任一非可选部件缺失或取不到即 `V2_COMPILE_NOT_PUBLISHED`，不返回部分 key
- [x] 10.2 `buildTemplatePack` 组装并**自检**（过 `parseTemplatePack`），失败即拒绝
- [x] 10.3 重编：`planParts({versionSuffix})` 产出带版本后缀的新名字，旧组件不删不改
- [x] 10.4 单测：未发布 / 有 key 取不到 / footer 缺省 / 组装可解析（`compile-preflight-backfill.spec.ts`，10 例）
- [x] 10.5 `verify` 用**真 import 冒烟**：逐个 `importComponentByKey`，后端超时 40s；只读到非空 key 不算已发布
- [ ] 10.6 命名红线校验：部件与收编零件的名字不得以 `_` 或 `.` 开头（否则 Figma 归入「不发布」）

## 11. MCP 工具

- [x] 10.6 命名红线校验：`isPublishableName`，`_` / `.` 开头在写画布之前就拒绝
- [x] 10.7 单测：命名红线（`compile-parts.spec.ts`）

## 11. MCP 工具

- [x] 11.1 `src/v2/compile/index.ts` 导出 `compileTemplate({ phase, source, library, project, staged?, partsPageId?, badgeContainerSourceId?, capabilities?, components?, write?, backend })`，并从 `src/v2/index.ts` 再导出
- [x] 11.2 `createServer.ts` 注册 `figma_compile_template`（写入类，`write` 缺省 `false`），`server.spec.ts` 工具清单已更新
- [x] 11.3 `write: true` 时先 `commitUndoCheckpoint('template-compile')` 再动手
- [x] 11.4 报告结构：`phase` / `parts`（含 componentId、key）/ `adopted` / `sets` / `capabilities` / `diffs` / `anchors` / `gaps` / `templateJson` / `written`
- [x] 11.5 单测：注册与写入声明、缺参数、干跑默认、缺部件、write 缺 partiesPage、后端未配置（`compile-tool.spec.ts`，6 例）

## 12. 验证（真机）

- [ ] 12.1 `npm run build --prefix packages/figma-mcp-server`；`npm test` 全绿（`--no-file-parallelism`）
- [ ] 12.2 `1:14`：干跑 → 实跑 → 发布 → `verify` 回填；产物探针 SHALL 全绿且能力全缺省
- [ ] 12.3 `798:17608`：人工粘贴 → 干跑核对 → 实跑（含收编「标签」组件集 + `num` 三角）→ 发布 → `verify`
- [ ] 12.4 `798` 收编校验：删除源模板中「标签」组件集后，用产物 key 导入 → 图例正常、无占位
- [ ] 12.5 `796:12489` 压力核对：只读母版子树，不触发全文档扫描
- [ ] 12.6 只读证明：三次执行前后 `1:14` / `798` / `796` 源模板指纹完全一致
- [ ] 12.7 `openspec validate template-compile-to-library --strict` 通过
