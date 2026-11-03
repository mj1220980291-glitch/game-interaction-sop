## 1. reconcile 填图

- [x] 1.1 落图与收尾拆开：`rect.fills` 单独失败才算失败，其余步骤 `soft()` 逐步吞错并记 `softFails`
- [x] 1.2 `layoutSizingHorizontal` 只在父级真是自动布局时设（`object is not extensible` 的元凶）
- [x] 1.3 带裁剪导出失败 → 退化整图导出（记 `export.crop`）
- [x] 1.4 `fillFigurePlaceholder` 返回 `softFails`；有值发 `V2_W_FIGURE_FILL_FALLBACK`
- [x] 1.5 退化路径也失败时 message 带两层错误
- [x] 1.6 真机：对 `4382:29391` 同步补图，图必须落上（不再 FILL_FAILED）
- [x] 1.7 **真因改为槽形态**：`PARTS_PROFILE.figureSlot='rect'` 把 GROUP 槽当裸矩形，`rectId = group.id` → 写 `fills` 抛 `object is not extensible`（同步与退化同错）。新增 `figureSlotShape` 按节点类型判，档案只兜底
- [x] 1.8 错误信息带 step（`export` / `setFills` / `getRect` …），`setFills` 附 `targetType / id / hasFills`
- [x] 1.9 填图/刷图脚本兜底：目标不接受 `fills` 时下沉到组内矩形
- [ ] 1.10 真机（0.3.9）：同步补图，图落上且无 FILL_FAILED / FALLBACK

## 2. 重插配图槽丢图

- [x] 2.1 `Plan.warnings` + 同步结果合并
- [x] 2.2 **删除带图配图条目时**发 `V2_W_FIGURE_IMAGE_LOST`（像素不可恢复，告警点前移到删除）
- [x] 2.3 重插时若旧标记仍有 hash 且无资产，再发一次
- [ ] 2.4 真机：删一条带图配图同步，确认删除当次就有告警

## 3. inline-suffix 职能

- [x] 3.1 `inline-suffix` + 有职能 → `V2_W_ROLE_ANNOTATION_UNSUPPORTED`
- [x] 3.2 测试 `tests/v2/role-inline-suffix.spec.ts`（有职能告警 / component-variant 不告警）
- [ ] 3.3 决策：职能拼进 `#Title_Main` 还是新增一行（需设计确认后再实现，本轮只告警）
- [ ] 3.4 真机：蛋仔包渲染，确认告警出现且不再静默

## 4. 收尾

- [x] 4.1 引擎 `0.3.6` → `0.3.7`，CHANGELOG `v2.3.9`
- [x] 4.2 门槛：`npm run build` + `npm test`（72 files / 569 tests）+ `openspec validate --all --strict`
