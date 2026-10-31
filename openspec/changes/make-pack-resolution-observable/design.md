## Context

模板有两个互相独立的寻址体系，长期混在一起：

1. **legacy 模板寻址**（`src/v2/template-config.ts:128-216`）——`template.fileKey/nodeId/componentKey` → env → `~/.game-interaction-sop/template.json` → `DEFAULT_TEMPLATE`（官方 `1:14`）。决定「克隆哪个模板节点」。
2. **模板包查找**（`loadTemplatePack`）——`$GISOP_TEMPLATE_PACK` → `<cwd>/.interaction-sop/template.json` → `~/.…/templates/<项目>.json` → `~/.…/templates/default.json`。决定「走多部件渲染还是 legacy 克隆」，以及 4 个库 key + 8 项能力。

`resolveTemplateConfig` 一次性算出两者，但只有第一项受 `template` 入参影响；第二项只由环境与 cwd 决定。

真机失败序列（M1/M2，2026-10-30）：

```
不传 template、传 target  → V2_TARGET_FILE_UNREACHABLE（render.ts:479，用 target fileKey 查 1:14）
传 template {fileKey,nodeId} → 无警告，pack 仍按 env/cwd 查 → 结果与没传一样
不传 target               → cloneNode: source not found（另一条路径）
```

`loadTemplatePack` 是 `readJson` + `parseTemplatePack`，两者失败都 `continue`（`template-config.ts:144-151`）——**跳过原因全部丢弃**，所以上层只能猜。

`bindTargetFile` 的执行顺序（`render.ts:462-471`）：

```
resolveTemplateConfig → 若 componentKey 有值 → 直接返回（库模式）
                      → 若 loadPartsPack() 有值 → 直接返回（多部件模式，不探 1:14）
                      → 否则按 legacy 探 1:14（这里才会说出 V2_TARGET_FILE_UNREACHABLE）
```

即：pack 命中时这条探针根本不执行，pack 未命中才走 legacy 探针并给出指向错误的报错。

## Goals / Non-Goals

**Goals:**

- 任何一次渲染都能从返回值直接答出：用了哪个 pack、来自哪个路径、四个 key 是否齐、能力是什么
- pack 未命中时，报错能列出 4 个候选路径与各自失败原因，一句话定位
- `template` 入参与 pack 查找的关系在返回值里显式，不再「传了没用」
- 诊断只读：不增加画布写入，不改渲染产物

**Non-Goals:**

- 不改 pack 的查找顺序与 JSON 字段（`template-contract` 既有契约不动）
- 不新增第 5 个候选路径、不引入项目级 env 自动推导
- 不动 legacy 渲染逻辑本身；`V2_TARGET_FILE_UNREACHABLE` 语义保留（它仍是「目标文件里没有模板节点」的正确描述，只是不再是缺包的替罪羊）
- 不做 pack 的 GUI 编辑器 / 自动生成

## Decisions

### D1：pack 查找返回「候选轨迹」而不是 `undefined`

`loadTemplatePack` 现在返回 `{path, pack} | undefined`。新增 `resolvePackWithTrace(opts)` 返回：

```ts
interface PackCandidate {
  path: string;
  origin: 'env' | 'cwd' | 'project' | 'default';
  state: 'hit' | 'missing' | 'invalid' | 'incomplete';
  reason?: string;       // invalid: 解析错误摘要；incomplete: 缺哪些 key
}
interface PackResolution {
  hit?: { path: string; pack: TemplatePack };
  candidates: PackCandidate[];   // 固定 4 项，顺序即查找顺序
  disabledByEnv?: boolean;       // GISOP_TEMPLATE_PACK=off
}
```

`loadTemplatePack` / `loadPartsPack` 保留为薄封装（`resolvePackWithTrace().hit`），既有调用点零改动。

替代方案：让 `loadPartsPack` 返回 `{hit, missingKeys}`。否决——调用点分散（`render.ts:471`、`compile/index.ts:240`、`render.ts:233` 的 `packCaps`），每个都要自己拼 message，文案会抖。

### D2：渲染入口解析一次，向下传

`renderV2MarkdownToFigma` 现在在三处各自查 pack（`:233` 取 caps、`:471` 判多部件、`summarize` 里的能力分支）。改为入口处 `const packResolution = resolvePackWithTrace()`，把 `pack` 传给这三处。理由：同一轮渲染不可能看到两份不同的 pack（cwd 不变），多次读盘只增加「读到一半被改」的窗口。

### D3：缺包 → 硬错误码，但只在「显式要 pack 却没给」时

三态：

| 情况 | 行为 |
|---|---|
| 未设 `$GISOP_TEMPLATE_PACK`，4 个候选全 missing | 保持 legacy 回落，但返回值带 `packMissing: true` + 轨迹；**不报错** |
| `$GISOP_TEMPLATE_PACK` 有值但 invalid / incomplete | 硬错误 `V2_TEMPLATE_PACK_MISSING`（用户明确指了路径，静默回落最误导） |
| `$GISOP_TEMPLATE_PACK` 有值且 hit，但缺 `top/chapter/cluster` 之一 | 同上硬错误，`reason` 列出缺哪几个 key |

替代方案：全部硬失败。否决——`default.json` 未落地的新机器会直接不可用，比现在更糟。

### D4：legacy 探针报错重写，不含歧义

`V2_TARGET_FILE_UNREACHABLE` 只可能在「pack 未命中」分支触发。message 改为三段：

```
模板包未命中（已查 4 个路径，见 pack.candidates）。
因此回落到 legacy 模板：在目标文件 <targetFileKey> 中查找节点 1:14 —— 该文件并非模板文件，
报错属预期之外，通常是模板包没配好。原始错误：<err>
```

并在该分支附带 `packMissing: true`。这样「目标文件」与「模板文件」在同一句话里被区分开。

### D5：`template` 入参被忽略 → 软告警，不报错

pack 命中（多部件 / 库模式）时，`template` 的 `fileKey/nodeId` 不参与任何决策。此时若调用方传了这两个字段，返回 `warnings: [{code: 'W_TEMPLATE_ARG_IGNORED', message}]`。

不选硬错误：`template` 是历史字段，SOP 与老脚本仍在传，硬失败会打断存量调用。

### D6：返回值结构

`RenderResult` 新增（都可选，向后兼容）：

```ts
pack?: {
  path: string;
  origin: 'env' | 'cwd' | 'project' | 'default';
  project?: string;
  components: { top?: string; chapter?: string; cluster?: string; footer?: string | null };
  capabilities: TemplatePack['capabilities'];
};
packMissing?: boolean;
packCandidates?: PackCandidate[];   // 仅 packMissing 时返回，避免正常路径返回体膨胀
```

`pack.path` 与 `packCandidates` 都是绝对路径，与 `HANDOFF` 里的排障口径一致。

### D7：`cloneNode: source not found` 独立归因

不传 `target` 走的是 active file 分支，pack 未命中时 legacy 克隆组件实例失败。这条与 D4 同源，message 同样先说明「模板包未命中 → 回落 legacy」，再附原始错误；错误码统一为 `V2_TEMPLATE_PACK_MISSING`（当且仅当存在明确的 pack 线索时）。

## Risks / Trade-offs

- [返回值变大，正常路径被日志刷屏] → `packCandidates` 只在 `packMissing` 时返回，`pack` 摘要 6 个字段
- [硬错误新态打断存量脚本] → 只在 `$GISOP_TEMPLATE_PACK` 显式指向坏路径时硬失败；无 env 的项目行为不变
- [`resolvePackWithTrace` 与 `loadTemplatePack` 双入口，未来可能只改一处] → 测试锁死「两入口对同一 cwd/env 返回一致结果」
- [legacy 探针文案变化让历史报错搜索失效] → 保留原错误码与 `Is the Desktop Bridge plugin running` 句式，只前置解释段
- [pack 摘要里暴露库 key，截图外传有泄漏面] → key 本身非机密（已在 `template.json` 明文），不额外脱敏

## Migration Plan

1. 先落纯函数（`resolvePackWithTrace`）+ 单测，不动渲染
2. 改 `RenderResult` 与工具 schema（仅新增字段），跑全量测试确认无回归
3. 改 `bindTargetFile` 诊断顺序与文案
4. 加 `W_TEMPLATE_ARG_IGNORED`；观察一轮真实渲染
5. 回滚策略：所有新字段可选、新错误码只在 env 显式配错时出现，逐步降级只需回退第 3、4 步

## Open Questions

- `default.json` 缺失时是否也回显 `packMissing`？（倾向回显，便于「为什么看起来是官方风格」这类问题的自查）
- `packCandidates` 的 `reason` 是否需要脱敏路径中的用户名？（当前 HANDOFF 风格是全路径，暂不脱敏）
