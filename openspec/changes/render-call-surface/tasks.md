## 1. 能力确认

- [x] 1.1 `createFrame` 已支持 `x` / `y`（`figmaConsoleBackend.ts:504`），无需改后端
- [x] 1.2 页面空位用 `getNodeInfo(pageId).childIds` + `getNodesInfo(ids)` 的 bbox 计算，两次只读往返

## 2. 落点

- [x] 2.1 `RenderInput` 增加 `position` / `autoPlace`
- [x] 2.2 parts 路径 `createFrame` 直接落在 `origin`（`render/parts/index.ts:198`）
- [x] 2.3 legacy 路径根帧建好后 `moveNode` 到位（库模式 detach 之后）
- [x] 2.4 `autoPlace` 包围盒计算：`below` 取最下沿 + 最宽子节点左边，`right` 取最右沿 + 最上沿
- [x] 2.5 互斥告警 `W_POSITION_OVERRIDE`、回退告警 `W_AUTOPLACE_FALLBACK`
- [x] 2.6 单测：指定坐标 / below / 互斥 / 无 pageId 回退（4 例）

## 3. 创建路径重试

- [x] 3.1 `renderWithRetry` 包住整轮创建，判据复用 `isTransientBridgeError`，可注入 `sleep`
- [x] 3.2 每轮 `createOnce` 自己开账本并回滚上一次的根帧（撤销点也移进 try 内，桥断时可被捕获）
- [x] 3.3 告警 `W_RENDER_RETRIED`（带首次错误摘要）
- [x] 3.4 单测：瞬时失败后成功、非瞬时错误不重试

## 4. 错误三段式

- [x] 4.1 `splitDiagnostic`：单行 message ≤200 字符，其余进 `details`
- [x] 4.2 缺包的多行候选清单同样走该规则（message 一句，清单进 details）
- [x] 4.3 工具 schema 增加 `position` / `autoPlace`，入参透传
- [x] 4.4 单测：40 行 dump → message 只有首行、`details` 完整

## 5. 回归与真机

- [x] 5.1 `npm run build && npm test` 全绿（64 files / 515 tests）；`openspec validate --strict` 通过
- [x] 5.2 真机：M1 用 `autoPlace: 'below'` 渲染，断言不压设计稿
- [ ] 5.3 真机：制造一次断连（重启插件）观察是否一次重试即成功

## 6. 文档

- [x] 6.1 `packages/skill/phases/phase4-figma.md` 补落点参数与重试说明
- [x] 6.2 `引擎问题反馈.md` 中 P1-8 / P2-9 / P2-10 标注对应 change 名（已在小节标题下标注）
