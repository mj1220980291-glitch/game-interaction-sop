## 1. 标记数据模型与 backend 能力

- [x] 1.1 新增 `src/v2/reconcile/stamp.ts`：定义 doc、section、cluster、item、slot 五类 stamp 的类型，`gisop`/`stamp` 常量，短 ID 生成器，JSON 编解码（解析失败的标记按无标记处理）
- [x] 1.2 在 `FigmaBackend` 上新增三个可选方法：`readStampedTree(rootId, maxNodes?)`（一次读回节点、标记、`characters`、自身 imageHash，以及页面上残留的 scratch 根）、`stampNodes(entries)`（支持 `captureHash`）、`applyOps(ops)`
- [x] 1.3 在 `figmaConsoleBackend.ts` 中实现上述三个方法。`applyOps` 在批首对字体去重加载，`place` 跳过锚点之后连续的无标记节点，遇到第一个失败的 op 就停下并返回其下标
- [x] 1.4 让 `tests/v2/helpers/mock-backend.ts` 支持 sharedPluginData、`readStampedTree`、`stampNodes`、`applyOps`（含故障注入 `faults.failAfterOps`）、`rasterizeNodeToImageFill`，以及模拟手贴节点的 `pasteForeign`

## 2. 首次渲染打标记

- [x] 2.1 新增 `reconcile/layout.ts`：渲染完成后读一次树，按位置把 IR 映射到节点（`mapLayout`），生成全部标记（`buildCreateStamps`）；容器里其余的直接子节点打上 `template` 槽位标记，保证"无标记 = 人加的"
- [x] 2.2 渲染末尾调用 `stampRenderedDoc`（`readStampedTree` + `stampNodes` 两次调用），返回值带上 `mode:'create'`；打标记失败只告警，不回滚文档
- [x] 2.3 更新 `render-subgroups.spec.ts` 的预期调用序列：末尾追加 `readStampedTree`、`stampNodes`，并在注释中写明理由
- [x] 2.4 新增测试：渲染后说明块的每个直接子节点都有标记，cluster 清单与 IR 一致，`iid` 无重复

## 3. 读取与对齐（纯函数）

- [x] 3.1 `reconcile/tree.ts` + `reconcile/snapshot.ts`：把 `readStampedTree` 的结果组装成 DocSnapshot（清单、外来节点、tombstone、重复 id 检测、中断残留的孤儿节点就地接管）
- [x] 3.2 `reconcile/align.ts`：通用的 LCS 序列对齐；先识别移动，再把同一段内相邻的删除与新增配对成"改"；规则条目与配图条目互不配对
- [x] 3.3 三层对齐（界面 → 簇 → 条目，`####` 小标题作为条目参与）以及 scope 过滤，scope 找不到时返回 `V2_SCOPE_NOT_FOUND`
- [x] 3.4 `reconcile/plan.ts`：实现 D5 的手改判定表、D6 的外来节点定位规则、D7 的结构级规则，产出按容器分组的 op、资产填充任务，以及 `changes`、`conflicts`、`preserved`
- [x] 3.5 单元测试：`reconcile-align.spec.ts` 覆盖对齐算法；`reconcile.spec.ts` 覆盖 spec 中全部场景（插入、改写、改名、手改保留、双改冲突、删除后不重建、手贴图定位 ×2、删除非空容器、调换簇顺序、scope、重复标记）

## 4. 执行与入口

- [x] 4.1 `reconcile/index.ts`：把各容器的 op 按每次最多 300 个合并成若干次 `applyOps`；出错即停，只报告已落地批次的 changes
- [x] 4.2 新增界面、簇、条目、角色框：只把需要的界面渲染成一份临时文档（scratch，从 `1:14` 克隆，复用现有渲染与打标记），再把节点搬进目标文档，最后删掉 scratch；scratch 只导出会被搬走的节点所需的资产
- [x] 4.3 实现锁：同步开始时写入 `lock{runId, at}`，60s 内已被占用则返回 `V2_RECONCILE_BUSY`；结束（含失败）时释放；`dryRun` 和无改动时不写锁
- [x] 4.4 在 `renderV2MarkdownToFigma` 中按 `target.rootId` 分流到 reconcile；没有 doc 标记时返回 `V2_NOT_STAMPED`；同步模式下不删除 root
- [x] 4.5 集成测试（mock backend）：create 后用同一份 md 同步结果为空且零写入；修改后同步；中途注入失败再重跑，结果收敛且无重复；dryRun 不写画布；并发时返回 BUSY；配图资产更新与手换图冲突

## 5. MCP 接口

- [x] 5.1 在 `createServer.ts` 的 `V2_RENDER_INPUT_SCHEMA` 中加上 `target.rootId`、`scope`、`dryRun`；handler 校验 scope 格式，并检查"没有 rootId 时不能带 scope/dryRun"
- [x] 5.2 更新工具描述（rootId 的用法、冲突不覆盖、dryRun、只比对文字）
- [x] 5.3 在 `server.spec.ts` 中补上参数校验与 mode 字段的测试

## 6. Skill 文档同步

- [x] 6.1 `packages/skill/phases/phase4-figma.md`：加入"重渲染走同步模式"的调用示例、`rootInstanceId` 的保存方式、结果 D（冲突裁决）、`V2_NOT_STAMPED` 的处理，以及"只比对文字、不比对样式"这一限制
- [x] 6.2 核对 skill 文档与主 spec 是否双向一致（`skill-sop-workflow` 中的"双向一致"要求）：该要求只约束 `markdown-v2-spec.md` ↔ `markdown-v2-contract`，本 change 未改 markdown 契约，无需同步

## 7. 真机验证

- [x] 7.1 `npm run build --prefix packages/figma-mcp-server`，让用户重启 MCP，用进程启动时间确认跑的是新进程
- [x] 7.2 在「Agent草稿」/变色龙页，用 HUD 的 md 以 create 模式渲染一份新文档（`624:3648`）→ 手贴 1 张图、手改 2 条文字 → 修改 md（改字、插入、删除、新增簇、换配图）→ 先 dryRun，再正式同步：计划一致，画布与三份清单都符合预期
- [x] 7.3 `scope:"01/2"` 只同步一个簇，其余内容不变；锁拒绝并发、过期后正常执行并清理残留 scratch；手工模拟中断残留的孤儿节点，重跑不重复、会被补进清单，设计师删掉后不会再插回来（借此发现并修复了"孤儿不进清单"的问题，补了测试）
- [x] 7.4 实测：一次包含新增簇和配图导出的同步约 40s，分成多次调用，每次都在 30s 内；300 ops/次的上限暂不调整，已记入 `.handoff/CURRENT.md`
