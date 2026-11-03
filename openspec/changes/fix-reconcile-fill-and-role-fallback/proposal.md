## Why

0.3.6 签收通过后仍有三条「无声丢数据」的遗留，都发生在**已有文档**的维护路径上：

1. reconcile 填图必挂（`object is not extensible`）→ 想给旧文档补图只能新建重渲，手改全废；
2. md 里删掉 `配图：` 再补回来，新槽是空槽，旧图不回来且无提示；
3. 模板声明 `roleAnnotation: 'inline-suffix'` 时引擎只会 `component-variant`，职能条目直接消失、零告警（蛋仔包投产阻塞）。

共同原则：**能力声明与实现不一致时，必须告警，不得静默降级。**

## What Changes

- reconcile 槽级填图失败 → 退化为「只把图刷进矩形」（`rasterizeNodeToImageFill`），发 `V2_W_FIGURE_FILL_FALLBACK`；图不再整张丢失
- 计划阶段识别「重插的配图槽原本有图但本次无资产」→ `V2_W_FIGURE_IMAGE_LOST`（带 assetKey）
- `roleAnnotation: 'inline-suffix'` 且有职能条目 → `V2_W_ROLE_ANNOTATION_UNSUPPORTED`（列出被丢掉的职能）
- `Plan` 新增 `warnings`，同步结果合并返回

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `render-reconcile`: 同步填图失败要有可用退化路径与告警；重插条目丢图要显式告警。
- `template-render`: 模板能力声明未实现时必须有软告警（`inline-suffix`）。

## Impact

- `packages/figma-mcp-server/src/v2/reconcile/index.ts`（`runFills` 退化 + 合并 plan 告警）
- `packages/figma-mcp-server/src/v2/reconcile/plan.ts`（`Plan.warnings`、重插丢图告警）
- `packages/figma-mcp-server/src/v2/render/parts/index.ts`（`inline-suffix` 告警）
- `packages/figma-mcp-server/src/v2/ir.ts`（3 个新告警码）
- 测试：`tests/v2/role-inline-suffix.spec.ts`
- 引擎 `0.3.6` → `0.3.7`
