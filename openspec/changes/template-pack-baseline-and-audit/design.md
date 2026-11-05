## 上下文

模板包是「本机产物」：项目目录那份被 `.gitignore` 忽略，用户目录那份在仓库之外。于是每个新机器、每个新同事都要重造一次；而造包的两条路径能力不对等（compile 全量、verify 缺 `sectionShell`），造完还没有验收手段。

用户已确认两条前提，本设计全程遵守：

1. **缺字段不算错**——模板结构可以不同，确实可能用不到某些观感字段
2. 模板包切换的体验后置，本次只解决「开箱可用 + 缺了能发现」

## 决策

### D1｜基线包放在引擎包内，只读，作为最后候选

`packages/figma-mcp-server/assets/packs/` 随 npm 包分发，用 `import.meta.url` 定位（`dist` 与 `src` 各跑一次路径推导，测试可注入）。

查找顺序：

```
1  $GISOP_TEMPLATE_PACK               显式路径（off = 全关）
2  <cwd>/.interaction-sop/template.json        项目自己定
3  ~/.game-interaction-sop/templates/<project>.json   用户覆盖
4  ~/.game-interaction-sop/templates/default.json     用户全局
5  <engine>/assets/packs/<project>.json        ← 新增：随包基线（按项目）
6  <engine>/assets/packs/default.json          ← 新增：随包基线（默认）
```

理由：把基线放最后，任何一层用户自定义都能盖掉它；把它放包内，`npm install` 即自带，不需要安装脚本复制文件（用户想改就 3/4 里放一份）。

### D2｜两套基线：官方 1.14（default）+ 蛋仔派对

- `default.json` = 官方 1.14，覆盖「没配项目的散装用法」
- `蛋仔派对.json` = 蛋仔，靠 `GISOP_PROJECT=蛋仔派对` 或项目配置命中
- 文件名匹配大小写不敏感，命中失败时退回 `default.json`

### D3｜基线包必须「完整」：capabilities 实测 + geometry 全量 + fingerprint

基线包的定位是「参考实现」，所以它不能是手抄的。产出流程固定为：

```
源模板文件 → figma_compile_template(phase=compile, staged.chapter=原稿章节)
           → 人工发布（Assets 面板）
           → figma_compile_template(phase=verify)
           → 取返回的 templateJson（含 geometry / capabilities / fingerprint）
           → 落到 assets/packs/
```

同时补 `captureGeometryFromKeys`：把 `sectionSourceId` / `sourceRootId` / `badgeSourceId` 透传下去（现在是死参数），让「库已发布」场景也能补采章节外壳与底色。

### D4｜key 失效要给专属错误，不落回模糊错误

`componentKey` 是发布快照的产物，库重发就会变。基线包带着旧 key 时：

- import 失败 → `V2_TEMPLATE_KEY_STALE`，message 含 `part` / `key` / `pack 路径` / 「用 phase=verify 重取 key」
- SHALL NOT 表现为 `Cannot connect` / 节点找不到 / 模板包缺失

### D5｜后果自检：只看结果，不看字段

第一批两条，都是软告警、都不阻断：

**C1 `W_TEXT_CONTRAST_LOW`（正文对比度）**

```
对每个章节：
  取正文文本节点的纯色 fill（有多个时取第一个非透明的）
  向上找最近一个「有实心填充」的祖先，取它第一个 SOLID fill
  算对比度 ratio = (L1+0.05)/(L2+0.05)
  ratio < 阈值 → 汇总一条警告：章节名 + 低于阈值的条数 + 两侧颜色
```

- 阈值默认 3.0（WCAG 大字号档），`GISOP_CONTRAST_MIN` 可配
- **跳过**：渐变 / 图片填充的背景、`INSTANCE` 内部（实例内部不在我们控制范围）、透明或无填充文本
- 一条章节一条聚合警告，不逐条刷屏

**C2 `W_PACK_GEOMETRY_DEFAULTED`（观感缺省）**

pack 缺 `docBackground` 或 `sectionShell` 时，一条警告点名缺哪项、后果是什么（「文档底色用默认白」「章节没有外框，黑边与卡片底色会缺」）。零 RPC。

**为什么不把「对比度低」判成错误**：模板可能故意低对比（水印、装饰文本）。判错会挡掉合法产物；告警只要求人看一眼。

### D6｜一个内核，两个入口

`src/v2/pack-audit.ts` 导出：

| 函数 | 用途 | 成本 |
|---|---|---|
| `auditPackFields(pack)` | 字段体检：缺什么、缺了影响什么（不判错） | 纯本地 |
| `auditRenderedContrast(nodes)` | C1 | 需要产物节点树（渲染期已在手，工具期读一次） |
| `auditPack(pack, opts)` | 上面两者的组合，返回 `{ findings, warnings }` | — |

- 渲染期：收尾调用 `auditPackFields` + `auditRenderedContrast`（快检），findings 折成 `warnings`
- 工具 `audit_template_pack`：参数 `{ path?, project?, deep? }`，`deep` 走完整版（含 fingerprint 与 key 冒烟）；只读，不写画布

**不引入新 RPC**：C1 需要的「正文 fill + 最近实心祖先」用渲染期已有的读取能力合并取一次；实在拿不到就跳过并记 `skipped` 原因，不报假阳性。

### D7｜能力错配（capabilities）本次只记不动

`capabilities` 缺省静默填默认值仍是隐患（声明 `component-variant` 而模板是 `inline-suffix` 会渲染错）。但检测它需要一次产物探测，成本与误报都高于对比度，**放到下一批**；本次只做一件事：pack 未显式写 `capabilities` 时，`auditPackFields` 输出一条「capabilities 来自默认值」的提示（不叫警告码，避免污染 warnings 契约）。

## 风险

| 风险 | 缓解 |
|---|---|
| 基线包 key 过期，用户直接踩 `V2_TEMPLATE_KEY_STALE` | 错误文案给出重取路径；release note 标注「基线为快照」 |
| 对比度误报（渐变底、图片底、装饰文本） | 只处理「纯色 fill + 纯色祖先」，其余跳过并记录 skipped；阈值可配 |
| 基线包被误当「唯一正解」 | 文档写明优先级：用户/项目包永远覆盖基线 |
| 两套基线包体积 | 纯 JSON，几 KB；不引入 assets 二进制 |
