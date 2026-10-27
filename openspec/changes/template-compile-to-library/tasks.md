## 1. 前置确认（写代码前完成）

- [x] 1.1 库文件已定：`交互SOP模板库` / `fileKey = jQf7zj33pzOGsGKO4d73OO` / 页面 `Page 1`
- [x] 1.2 发布权限已验：冒烟组件发布成功，从 `Agent草稿`（`UYCJok3MXTWITMfeJSqEF6`）`importComponentByKeyAsync` 取件成功，首次 7.2s。踩坑：组件名以 `_` 开头时 Figma 判定「不发布」（Publish 弹窗落 `Hidden`）
- [x] 1.3 确认 `Noto Sans SC` 可加载：实测仅 `Regular` / `Medium` / `Bold` 三档（无 Light / Black）→ 映射表只在这三档内选

> 1.2 / 1.3 任一不通过，本变更停在文档阶段，不写代码。

## 2. 编译 SOP 文档

- [x] 2.1 新增 `packages/skill/references/template-compile.md`：粘贴清单（整块模板 + `1:14` 气泡）、两步发布、verify 登记、重编纪律、7 条排错、已知债务
- [x] 2.2 `packages/skill/references/template-contract.md` 补「归一化模板归属」一节（引用本变更 `template-contract` delta）
- [x] 2.3 `packages/skill/phases/phase4-figma.md`：探针 `ready` 但无 key 时，指向本 SOP 要求先编译，不硬凑同文件模式

## 3. 后端能力补齐

- [x] 3.1 `FigmaBackend` 增加可选方法：`createComponentFromNode`、`combineAsVariants`、`setPluginData`、`renameNode`、`readComponentKey`、`importComponentByKey`
- [x] 3.2 `figmaConsoleBackend.ts` 实现上述方法（`figma_execute` 内联脚本，沿用 `SERIALIZE_NODE_FN`）；`importComponentByKey` 超时 40s。真机已验证：FRAME→COMPONENT（id 变）、两组件合成 `COMPONENT_SET`、`gisop` plugin data 往返、`key` 可读（临时页已删）
- [x] 3.3 补单测：detach 后返回新 id、类型变 FRAME
- [x] 3.4 `readComponentKey`：非组件 / 无 key / 节点不存在一律返回 `null` 不抛错；代码注释写明「key 非空 ≠ 已发布」

## 4. 干跑：粘贴后的核对

- [x] 4.1 新增 `src/v2/compile/intake.ts`：核对部件是否齐全、类型能否转组件、尺寸是否与探针记录吻合（容差 4px）、标号容器是否为 FRAME
- [x] 4.2 缺口逐条输出：缺部件 / 尺寸对不上（附「粘错项目」提示）/ 类型不对 / 名字不同（只提醒不拦）；失败即 `V2_COMPILE_STAGED_PART_MISMATCH`，**不建任何组件**
- [x] 4.3 单测：齐全通过 / 尺寸不符 / 漏粘 / 文本节点 / 改名只提醒 / 标号容器类型 / 节点不存在（`compile-intake.spec.ts`，7 例）
- [x] 4.4 接入编排：配置错误（缺 `partsPageId`）优先于素材错误；干跑时失败降级为缺口，实跑时硬拒绝

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

- [x] 12.1 `npm run build --prefix packages/figma-mcp-server`；`npm test` 全绿（295/295，`--no-file-parallelism`）
- [ ] 12.2 `1:14`：干跑 → 实跑 → 发布 → `verify` 回填 —— **未跑**（本机粘贴的是 `1:14` 整块，尚未作为独立项目编译过）
- [x] 12.3 真机跑通（用 `796:12489`「局内相关交互」，非 798）：人工粘贴整块模板 → 干跑 → 实跑（4 部件 + 收编「标签」6 变体集 + `num` 三角 + `-完成` 单成员降级）→ 人工发布 → `verify` 4 key 全部跨文件取到
- [ ] 12.4 收编后独立性校验：删除源模板中「标签」组件集后，用产物 key 导入 → 图例应正常、无占位 —— **未做**（需在源文件里删组件，破坏性，留待用户确认）
- [x] 12.5 `796:12489`（14110 节点）压力核对通过：编译只碰母版子树，字体归一化 638+70 处映射，全程未触发全文档扫描
- [x] 12.6 只读证明：`preflight` 用探针同一指纹比对通过（`sha256:c47d41e9…`），项目源模板零写入
- [x] 12.7 `openspec validate --all --strict` 12/12 通过
- [x] 12.8 截图验收：部件页 4 个（顶部/章节/簇/结尾，无灰框无占位）+ 零件页 3 个（标签变体集 / num / -完成），库里无截图资产（72 个大尺寸实例被判为内容跳过）
- [x] 12.9 回填落盘：`~/.game-interaction-sop/templates/蛋仔派对.json`，`parseTemplatePack` 校验通过

> 真机偏差记录：实际编译的是 `796:12489`（蛋仔派对「局内相关交互」），不是 798；两者同骨架，能力判定一致。`12.2` / `12.4` 未做，别当成已完成。
