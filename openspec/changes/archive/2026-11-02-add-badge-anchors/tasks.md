## 1. 引擎 · 同步按锚点重摆

- [x] 1.1 `src/v2/parts/geometry.ts` `placeBadges`：已有标号在给了锚点时按锚点移动；新增 `warnMissing` 参数
- [x] 1.2 `relayoutBadges` 透传 `warnMissing`
- [x] 1.3 `src/v2/reconcile/index.ts`：`anchorsOnly` 放行条件（md 未改 + 有锚点 → 不提前返回）
- [x] 1.4 `src/v2/reconcile/index.ts`：锚点专用重摆循环，跳过已处理章节，`keepCount = clusterCount`、`warnMissing = false`

## 2. 测试

- [x] 2.1 `tests/v2/render-badge-anchor.spec.ts` 增「同步重排：已有标号按锚点移动、不新增、不刷缺锚告警」

## 3. 文档与记录

- [x] 3.1 `packages/skill/phases/phase4-figma.md`：渲染前读 `.interaction-sop/anchors/<需求名>.json` 并入 `badgeAnchors`；说明 md 没改也会重摆
- [x] 3.2 `CHANGELOG.md` 增 `v2.3.1` 条目
- [x] 3.3 版本号 → `2.3.1`（根包 / package-lock / skill 包 / manifest）
- [x] 3.4 主 spec 同步：`engine-mcp-server`、`render-reconcile-parts`

## 4. 校验

- [x] 4.1 `npx openspec validate add-badge-anchors --strict`
- [x] 4.2 `npx openspec validate --all --strict`
- [x] 4.3 `npm run build` + `npm test`
