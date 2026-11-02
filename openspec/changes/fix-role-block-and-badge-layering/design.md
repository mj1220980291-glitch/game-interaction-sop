## Context

kiroro 主串联的反馈 #2 有 8 条，逐条对代码后收敛成 3 个代码缺陷 + 4 个文档/诊断缺口：

| 反馈 | 代码事实 |
|---|---|
| P0-1 `variantKeys` 在 MCP 里不生效 | `render/parts/index.ts:689` 调 `fillCluster(..., undefined)`，parts 路径从未传 `roleBlocks`；`render.ts:1900` 的报错前缀取 `p.roleBlocks?.config.variantPrefix ?? '职能标记='`，正好解释「改 prefix 不生效」 |
| P0-2 跨库 `componentSetId` 静默降级 | `role-block.ts:104-112` 读不到就把 warning 吞掉并返回 `undefined`，随后 `assertRoleBlocksAvailable` 抛「模板未配置组件集」 |
| P1-3 主图压住标号 | `figmaConsoleBackend.ts:351` 用 `appendChild` 放主图实例再删占位，节点被移到父级末尾 |
| P1-4 未传锚点不告警 | 既有 spec 明确「整表不传 = 全网格、不产生锚点告警」（`engine-mcp-server/spec.md:312`），是文档措辞与 skill 话术的歧义 |
| P1-5 `imagesPlaced: 0` | parts 的 `image` 标记只看「主图槽找到 + asset 非 skip」，同轮 stamp 又报 `缺槽位 main`，说明实例化后槽位名/层序变了 |
| P1-6 重渲冲掉手工修正 | ①③ 引擎该修；「正文改 `@职能`」同步不支持，属已知限制 |
| P2-7 多实例不可见 | `figma_get_status` 属外部 figma-console MCP，本仓无法扩展 |
| P2-8 校验时机晚 | `assert` 只看「有没有配置」，没按 IR 实际角色校验 |

约束：parts 路径是当前所有项目的主路径（pack 命中即走），legacy 路径必须保持不变；已渲染文档不能因本次升级产生同步噪音。

## Goals / Non-Goals

**Goals:**

- parts 模式与 legacy 模式对 `@职能` 的行为一致：`variantKeys` / `componentSetId` 都能生成组件实例。
- 标号默认可见，不需要渲染后手工提层。
- 配置生效链路可观测：一次调用的返回值就能看清「读的哪个文件、用了哪种模式、解析出哪些角色」。
- 失败早退：缺角色在克隆模板前返回，不留残留节点。

**Non-Goals:**

- 不改 `figma_get_status`（外部 MCP 的工具，本仓无所有权）。
- 不实现同步时把普通正文条目改写成 `@职能` 组件实例。
- 不改锚点缺省语义（不传 = 全网格不告警），只改文档措辞。
- 不重构「例外判定散在四处」等既有债务。

## Decisions

### D1 角色运行时单点构造，向下传参而不是层层重解析

`renderInner` 已构造 `roleBlocks`；把 `RoleBlockRuntime | undefined` 加进 `renderFromParts` 入参 → `FillChapterCtx` → `fillCluster`。不在 parts 里再调 `loadRoleBlocks`，避免同一轮读到两份不同配置（等价于 10-30 那轮 `resolvedPack` 的教训）。

替代方案：让 `fillCluster` 自己按 `input.template` 解析。否决——每章多一次配置读 + 多一次组件集读，且与入口可能不一致。

### D2 `loadRoleBlocks` 返回结构化结果，不再「warning + undefined」

```ts
type RoleBlockFailure =
  | { kind: 'not-in-target-file'; componentSetId: string; cause: string }
  | { kind: 'no-variants'; componentSetId: string; setName: string; prefix: string }
  | { kind: 'no-valid-roles'; source: 'variantKeys' };

type RoleBlockLoadResult =
  | { ok: true; runtime: RoleBlockRuntime; source: 'keys' | 'set' }
  | { ok: false; failure: RoleBlockFailure };
```

`render.ts` 把它转成具体错误码：`not-in-target-file` → `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`（message 指明「`componentSetId` 只在渲染目标文件内解析，跨库请改用 `variantKeys`」）；`no-variants` / `no-valid-roles` 沿用 `V2_ROLE_BLOCK_UNAVAILABLE`。

替代方案：继续返回 `undefined` 靠 warning 文本区分。否决——调用方无法程序化判断，反馈 #2 的误诊就是这么来的。

### D3 角色覆盖预检放在 IR 之后、克隆之前

新增 `missingRoles(ir, runtime): string[]`：遍历 IR 的 `@角色` bullet，取 `canonicalRole`，与 `variants` ∪ `variantKeys` 比对。非空即抛 `V2_ROLE_BLOCK_UNAVAILABLE`，`details.missingRoles` 列出缺的角色。位置在 `renderInner` 里 `loadRoleBlocks` 之后、`assertRoleBlocksAvailable` 同处；parts 与 legacy 共用。

### D4 配置来源进返回值，层级优先级写进契约

`loadConfigFile` 返回 `{ path, config }`，`resolveTemplateConfig` 带上 `configPath`。渲染返回值新增：

```json
"resolvedRoleBlock": {
  "mode": "keys" | "set",
  "source": "~/.game-interaction-sop/template.json",
  "componentSetId": "4333:9920",
  "variantPrefix": "职能标记=",
  "labelTextName": "文本",
  "roles": ["策划", "拼接", "GUI", "动效", "音频", "程序", "美术"]
}
```

优先级：`variantKeys` 非空则用它，忽略 `componentSetId`（当前 `loadRoleBlocks` 已是此行为，本次只是写进 spec + 回显）。另返回顶层 `enginePid`，多实例排查时至少知道是哪个进程答的。

### D5 `placeInstance` 原位替换并继承槽位名

`index = parent.children.indexOf(ph)` → `parent.insertChild(index, inst)` → `inst.name = ph.name` → `ph.remove()`。三条收益：层序不变（标号不再被压）、`主图` 槽名保留（stamp 与统计可继续按名找）、实例尺寸/居中逻辑不变。

`figma_node` 走 rasterize 路径不替换节点，不受影响；`image` 走 `setImageFill` 也不受影响。

替代方案：渲染末尾把 `气泡` 容器 `insertChild` 到末尾。否决——只治标号，主图槽名丢失、stamp 缺槽、统计错这三个症状还在。

### D6 统计按「实际落图」计，并补主图槽缺失告警

`applyAsset` 返回 `boolean`（是否真的调用了落图 API）。parts 的 `image` 改为该返回值；`imagesPlaced` = 落图章节数，`placeholdersUsed` = 其余。`fillChapter` 里主图槽找不到且有 chapter 资产时补 `V2_W_MAIN_SLOT_MISSING`（带章节名），与 stamp 的 `V2_W_STAMP_LAYOUT_MISMATCH` 互补而不是重复计数。

### D7 锚点语义只改文档，不改行为

既有 spec 已写明「整表不传 = 全网格、无告警」。要改的是工具描述与 skill 话术：明确「要么整表给全，要么不传；只给一部分才会告警」。同时补「锚点 = 主图归一化坐标，取控件左上角再往上偏 10–20px」的取值建议。

### D8 多实例诊断落在本仓可控面

`enginePid` + `configPath` 进渲染返回值；`V2_W_*` 之外不再造新工具。在 skill 的排障段落补「渲染返回的 `enginePid` 每次不同 = 多个引擎在接同一份配置」。

## Risks / Trade-offs

- [`loadRoleBlocks` 签名变更会波及现有测试与调用点] → 先改类型 + 全量跑 `npm test`，失败点即调用点；只保留一个导出签名，不加重载
- [`inst.name = ph.name` 可能被 Figma 拒（实例改名一般允许）] → 失败时 try/catch 降级为不改名，只丢诊断精度，不影响渲染
- [`insertChild` 索引在异步删除后可能错位] → 在同一 exec 内完成「算索引 → insertChild → remove」，与现有 `createText`/`groupFigure` 的单 exec 惯例一致
- [parts 现在能渲染 `@职能` 后，旧文档同步可能把新实例当 foreign] → 新实例打标走既有 `role` slot 分支（`reconcile/stamp.ts` 已有 `role` 结构），真机需跑一次幂等同步确认
- [反馈 P1-5 的根因可能与 D5 不完全重合] → 保留「现场复核该模板 `主图` 槽实际名字」为验收步骤；若名字本就不同，另开小 change 处理槽位名归一

## Migration Plan

1. 引擎改动 + 单测全绿（`npm run build` / `npm test` / `openspec validate --all --strict`）
2. 版本 `0.3.0 → 0.3.1`，CHANGELOG 记录三条行为变化（parts 支持职能组件、主图保位、返回值新增诊断）
3. 使用方重跑 `npm run install-mcp` 或重启 MCP；skill 无需重新安装（本次只改文档话术）
4. 真机：kiroro 目标文件重渲一次，核对 9 标号可见、`@程序` 成实例；再跑一次幂等同步确认无新增冲突
5. 回滚：本 change 全是增量行为，回退到 `cc4991f` 即可；无数据迁移

## Open Questions

- P1-5 的另一半（该模板 `主图` 槽是否真的叫 `主图`）需要现场用 `figma_get_file_data` 核一次，核不到就按 D6 的告警先行暴露
- 同步把「普通正文」改成 `@职能` 要不要支持，本轮只写文档说明为已知限制，等用户确认是否值得做
