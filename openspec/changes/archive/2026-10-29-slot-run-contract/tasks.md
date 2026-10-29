## 1. 共享 run 规则

- [x] 1.1 新建 `packages/figma-mcp-server/src/v2/template/runs.ts`：`splitRuns(children)` 返回 `{ header, runs }`，`Run` 含 `title / roleFrame / body[] / figure / extras`；按 design D1 实现判定，`clusterGroups` 作为入参处理 `none` / `inline-subtitle`
- [x] 1.2 导出 `isCompleteRun(run)`、`firstCompleteRun()`、`runMemberIds()` 与 `isFigure()`，供编译探针与渲染共用
- [x] 1.3 新增 `tests/v2/runs.spec.ts`：两段 run / 无 `#Title` / 无正文 / `none` / `inline-subtitle` 五类用例

## 2. 后端能力

- [x] 2.1 `src/v2/figma-client.ts` 增加可选方法 `groupNodes?({ parentId, name, childIds })` 与 `createText?({ parentId, name, characters, box })`
- [x] 2.2 `src/server/figmaConsoleBackend.ts` 实现两者（GROUP 包壳保持绝对位置；文本用 Noto Sans SC）
- [x] 2.3 `tests/v2/helpers/slots-backend.ts` 补齐两个假实现，保证现有用例不受影响

## 3. 编译侧

- [x] 3.1 `compile/normalize-slots.ts`：`findRoleFrame` 改为 `findRoleFrames`，全部职能帧统一改名，消灭未命名孤儿帧
- [x] 3.2 `compile/slim-parts.ts`：簇分支改为按 `splitRuns` 保留第一个完整 run，其余 run 的每个根整批删除；取消「正文裁到 1 条 / `#Title` 裁到 1 个」
- [x] 3.3 `compile/slim-parts.ts`：配图槽改为 GROUP 化（已有 GROUP 原地清洗、裸矩形走 `groupNodes` + `createText`），删除 `replaceWithPlaceholder` 调用
- [x] 3.4 `compile/errors.ts` 增 `RUN_CONTRACT_BROKEN: 'V2_COMPILE_RUN_CONTRACT_BROKEN'`
- [x] 3.5 `compile/index.ts`：建组件前用 `splitRuns` 预检原稿簇，失败即抛错且不写画布
- [x] 3.6 `compile/index.ts`：瘦身后对产物簇做 run 不变量校验，失败抛错并在报告里列出已建组件 id
- [x] 3.7 `compile/index.ts`：报告 `checks` 增加 run 契约一项，干跑（`write:false`）同样给出结论

## 4. 渲染侧

- [x] 4.1 `render.ts`：删除私有 `splitSlotRuns`，`fillGroupSlots` 改用共享 `splitRuns`
- [x] 4.2 `render.ts`：整段删除原型 run（含 `extras` 里的重复职能帧 / 配图槽），块内职能帧保持唯一
- [x] 4.3 `render.ts`：配图克隆源优先取 run 里的 GROUP；`isFigureSlot` 保留裸矩形兼容（旧包）
- [x] 4.4 `reconcile/layout.ts`：配图与职能帧判定改为复用 `runs.ts` / `template-slots.ts`

## 5. 测试与静态校验

- [x] 5.1 新增 `tests/v2/fixtures/slot-runs.ts`：`officialTwoRuns`（1:14 两段）与 `bareFigureRun`（裸矩形配图）
- [x] 5.2 `tests/v2/slot-run-slim.spec.ts`：断言保留 2 条正文、1 个 `#Title`、1 个职能帧、1 个配图 GROUP，且无孤儿帧
- [x] 5.3 `tests/v2/slot-run-slim.spec.ts`：断言裸矩形包壳后为 GROUP + `配图占位` + `配图占位文案`
- [x] 5.4 `tests/v2/render-subgroups.spec.ts`：断言配图只克隆 GROUP 形态、职能帧整块唯一
- [x] 5.5 `tests/v2/slot-run-slim.spec.ts`：预检拒绝无 run 原稿；产物两段 run / 配图被拍平均报 `V2_COMPILE_RUN_CONTRACT_BROKEN`
- [x] 5.6 `npm run build` + `npm test` 全绿（454/454）；`npx openspec validate --all --strict` 全绿（18/18）

## 6. 官方1.14 真机验收

- [x] 6.1 重编 `官方1.14`（`phase=compile`），检查产物簇：1 段 run、2 条正文、配图 GROUP 含矩形与占位文案、无孤儿职能帧（产物 `100:133` / `100:141` / `100:177`）
- [x] 6.2 人工在 Figma 发布 4 个部件（用户操作；实际 3 个，无结尾块）
- [x] 6.3 回填 key 到 `官方1.14.json`，旧包保留 `.bak`（`phase=verify` 不可用，改用沙盒真 import 冒烟 + 手写 pack）
- [x] 6.4 用测试 md 渲染一版并截图核对：沙盒 `87:583`，配图占位文案存在、两段 `####` 正文条数与小标题齐全、未使用的配图槽已隐藏
- [x] 6.5 更新 `openspec/HANDOFF.md`：写入新坑位（cloneSlimPart 内部裁剪、配图槽判定、badgeSlot 传参、截图需切 active file）与本次结论
