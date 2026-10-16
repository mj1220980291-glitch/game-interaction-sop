## 1. 测试先行

- [x] 1.1 新增 `tests/v2/render-inline-figures.spec.ts`：覆盖 spec 中 5 个场景（扁平多图原位 / 单图在末尾 / 槽位段内多图 / 说明块02 多图走种子 / 描述各自写入），确认当前实现下失败
- [x] 1.2 新增「无配图文档 backend 调用序列不变」断言（录制调用序列，与改动前快照比对）——复用 `render-subgroups.spec.ts` 已有 BASELINE_CALL_SEQUENCE 断言，未重复

## 2. render.ts 实现

- [x] 2.1 抽出 `appendBulletsInOrder` helper：按 bullet 顺序追加克隆（连续规则合并 batchClone、每条配图 1 次 cloneNode），返回正文 textUpdates 与 `{ groupId, desc }[]`
- [x] 2.2 新增 `writeImageHints`：对说明块一次 `scanSubtree`，定位各新 `配图` 的 `配图占位文案`，返回 textUpdates——实现名为 `collectImageHintUpdates`
- [x] 2.3 `fillBlockContent`：有配图时走原位分支（append → 删除模板直接子 `正文/规则` 与 `配图`（种子豁免）→ 批量写正文 + 描述）；无配图保持原代码路径
- [x] 2.4 `fillGroupSlots`：每段改用 `appendBulletsInOrder`；描述写入改为 `writeImageHints` 合并批量
- [x] 2.5 更新 render.ts 头部注释与 Bug 3 注释，说明原位多图语义

## 3. 文档同步

- [x] 3.1 `packages/skill/references/markdown-v2-spec.md` W3 删除「已知差距」说明
- [x] 3.2 `packages/skill/references/template-1-14.md` 配图映射行改为「每条 `配图：` 原位克隆一个配图占位」

## 4. 校验

- [x] 4.1 `npm test --prefix packages/figma-mcp-server` 全部通过（含现有 render-image-seed / render-subgroups / render-multi-section）
- [x] 4.2 `npm run build --prefix packages/figma-mcp-server` 通过 tsc
- [x] 4.3 `openspec validate engine-inline-multi-figure` 通过
