> 状态：**0.3.6 真机签收通过**（2026-11-03）。签收证据见各条备注；遗留三条另开
> `fix-reconcile-fill-and-role-fallback`。

## 1. 配图槽几何归一（引擎）

- [x] 1.1 `FigmaBackend` 接口新增 `normalizeFigureSlot({ groupId, rectId?, hintId?, sourceGroupId? })`，返回实测 `FigureSlotGeometry`
- [x] 1.2 `figmaConsoleBackend` 实现该方法（单次 exec）：读源槽几何取间距，按 auto-layout / 无布局两种情形写坐标与尺寸
- [x] 1.3 `parts-backend` 补假实现（复现「克隆槽 y 漂移」的真机症状），供几何断言使用
- [x] 1.4 新增 `V2_W_FIGURE_SLOT_GEOMETRY` 软告警码与 `figureSlotGeometryProblems` 校验函数
- [x] 1.5 克隆分支（`appendBulletsInOrder` 的 `配图` 分支）克隆后立刻归一，并把结果交给校验
- [x] 1.6 占位灰板分支（`render/parts/index.ts`）改用同一归一，删掉 `centerHint` 的独立居中逻辑
- [x] 1.7 parts 路径补 `imageSeed.flush`：md 有 `配图：` 时必须清掉克隆源
- [x] 1.8 `fillFigurePlaceholder` 填图后不额外归一 —— **决定：保留现状**（填图分支有自己的尺寸归一与居中），两条分支的不变式由渲染收尾统一校验
- [x] 1.9 归一失败或不变式不满足时只告警，不中断渲染

## 2. 条目序号对齐（同步）

- [x] 2.1 `expectedItems` 新增 `includeSubtitles` 选项（默认 `true`）
- [x] 2.2 parts 计划侧改传 `{ includeRoles: false, includeSubtitles: false }`
- [x] 2.3 `scratchPartsId` 越界改抛 `V2_RECONCILE_ITEM_OUT_OF_RANGE`
- [x] 2.4 该错误码透传到 `errors[]`，不再被包成 `V2_RECONCILE_RUNTIME_ERROR`
- [x] 2.5 legacy 路径行为不变
- 真机：12 条目簇同步正常、两次同 md `changes: []`（用户 0.3.6 回执）

## 3. 回归测试

- [x] 3.1 「一簇 3 张配图（全缺资产）」的几何断言（已改为绝对坐标口径）
- [x] 3.2 「缺资产与已填图混合」
- [x] 3.3 「槽里没有占位文案」
- [x] 3.4 `figureSlotGeometryProblems` 单测（含 GROUP 局部 y≠0 也算合格）
- [x] 3.5 `expectedItems` 子标题用例
- [x] 3.6 parts 同步端到端：无进程内 harness，**已由真机验收覆盖**（见 4.2）
- [x] 3.7 越界错误码：同上，真机 + 代码评审覆盖
- [x] 3.8 72 files / 569 tests 全绿，无快照漂移

## 4. 真机验收与收尾

- [x] 4.1 M1 重渲（页 `4216:41110`）：39 槽绝对坐标断言 39/39，占位组高统一 323，几何告警 0
- [x] 4.2 同步：`errors: []`，两次同 md `changes: []`，加/删条目落点正确
- [x] 4.3 `W_FIGURE_SLOT_GEOMETRY` 残留：0 条
- [x] 4.4 文档：CHANGELOG + `figma-mcp-pitfalls.md` 陷阱 4/5/6
- [x] 4.5 引擎版本（最终 `0.3.7`）
- [x] 4.6 门槛：build + test + `openspec validate --all --strict`，随归档提交

## 5. 二次反馈补充（0.3.2 回执）

- [x] 5.1 收尾批量归一 `normalizeFigureSlots`（一次 exec），被压到 5~7px 的已填图槽恢复到 ≥100px
- [x] 5.2 收尾逐槽校验 → `V2_W_FIGURE_SLOT_GEOMETRY`（含簇 + `#序号`）
- [x] 5.3 `summary.figureSlotsNormalized` / `chaptersNormalized` 作为新旧进程的凭据
- [x] 5.4 章节高度自愈 `normalizeChapterLayout`
- [x] 5.5 假后端复现真机症状，避免假绿
- [x] 5.6 端口竞争：已在第六节实现（`E_BRIDGE_PORT_CONFLICT` + 自动恢复 + 单例）
- [x] 5.7 parts 同步的进程内 harness：仍缺，由真机覆盖（**技术债，见 7.10 / 8.x**）

## 6. Bridge 端口所有权（第三份反馈）

- [x] 6.1 worker 启动探测端口回退 → 清占用者 + 重拉子进程 + 3×2s 轮询回正
- [x] 6.2 只强杀同类进程
- [x] 6.3 恢复失败不让 worker 退出
- [x] 6.4 `E_BRIDGE_PORT_CONFLICT` + `details.bridge` + 清理指引
- [x] 6.5 `get_skill_requirements` 返回 `bridge`
- [x] 6.6 supervisor 单例（pid 锁，第二份让位）
- [x] 6.7 `tests/server/bridge-state.spec.ts` + `phase4-figma.md` 验收口径
- [x] 6.8 未做项已登记：桥进程 lock 复用 / 插件退避重连（另仓）
- [x] 6.9 真机：3 次 render 无需 taskkill、`enginePid` 稳定、`fallback=false`

## 7. 第四份反馈（0.3.4 回执）

- [x] 7.1 端口层 / Bug 3（create）通过
- [x] 7.2 GROUP 坐标系：归一以组原点平移（`FRAME` 才 0 基局部）
- [x] 7.3 顺序固定：先矩形、再文案
- [x] 7.4 校验改绝对坐标
- [x] 7.5 修 `gap` 未定义崩溃：脚本合并为 `figureNormalizeScript`
- [x] 7.6 summary 白名单透传
- [x] 7.7 父级坐标非原点用例 + 假后端 GROUP 语义
- [x] 7.8 复验：39 槽 39/39、告警 0、组高 323
- [x] 7.9 复验：两次同 md `changes: []`、章节高不变
- [ ] 7.10 worker 重启时 bridge 与 worker 生命周期解耦 —— **未做，另开 change**

## 8. 第五份反馈（0.3.5 回执）

- [x] 8.1 Bug 1 / Bug 2 / 端口层 / create 路径 Bug 3 通过
- [x] 8.2 reconcile 收尾复位章节 HUG（每章、写入之后）
- [x] 8.3 `stretchLeftColumn` 对自动布局章节跳过
- [x] 8.4 `summary.figureSlotsUnhealthy`
- [x] 8.5 `tests/v2/chapter-left-column.spec.ts`
- [x] 8.6 复验：create + reconcile ×3，四章恒 1200 HUG、行 MIN、幂等
- [x] 8.7 判据修订：占位槽组高 323 + 章节高 = 内容高
