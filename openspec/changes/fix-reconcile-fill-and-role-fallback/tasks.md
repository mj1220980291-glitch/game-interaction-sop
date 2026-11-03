## 1. reconcile 填图

- [x] 1.1 `runFills` 槽级填图失败 → `rasterizeNodeToImageFill` 退化 + `V2_W_FIGURE_FILL_FALLBACK`
- [x] 1.2 退化失败才回 `V2_W_FIGURE_FILL_FAILED`
- [ ] 1.3 真机：对 `4382:29391`（M1）同步补图，确认图片落上且只有 fallback 告警（不再丢图）

## 2. 重插配图槽丢图

- [x] 2.1 `Plan.warnings` + 同步结果合并
- [x] 2.2 计划识别「旧标记有 imageHash + 本次无 assetMap 键」→ `V2_W_FIGURE_IMAGE_LOST`
- [ ] 2.3 单测：删图再恢复的同步（需 parts 同步进程内 harness，暂缺；真机覆盖）

## 3. inline-suffix 职能

- [x] 3.1 `inline-suffix` + 有职能 → `V2_W_ROLE_ANNOTATION_UNSUPPORTED`
- [x] 3.2 测试 `tests/v2/role-inline-suffix.spec.ts`（有职能告警 / component-variant 不告警）
- [ ] 3.3 决策：职能拼进 `#Title_Main` 还是新增一行（需设计确认后再实现，本轮只告警）
- [ ] 3.4 真机：蛋仔包渲染，确认告警出现且不再静默

## 4. 收尾

- [x] 4.1 引擎 `0.3.6` → `0.3.7`，CHANGELOG `v2.3.9`
- [x] 4.2 门槛：`npm run build` + `npm test`（72 files / 569 tests）+ `openspec validate --all --strict`
