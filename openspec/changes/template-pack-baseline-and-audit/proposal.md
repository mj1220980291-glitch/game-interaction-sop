## Why

2026-11-04 变色龙项目：换电脑后旧的模板包丢失，用户重新打开组件库、让 Agent 照着库里的组件 key 生成了一份新 pack。结果少了 `geometry`（`docBackground` / `sectionShell`）：

- 文档根落默认 `#FFFFFF`，章节没套外壳 → 模板的 `#EEEEEE` 浅字压白底，**整章正文不可读**
- 渲染返回 `ok: true`、`errors` 空，只有一条无关的 `V2_W_BADGE_ANCHOR_DEFAULTED` —— 没有人、也没有任何字段能看出「观感参数缺了」

查证得到三条事实：

1. **模板包不随仓库分发**：`<项目>/.interaction-sop/template.json` 被 `.gitignore` 忽略；`~/.game-interaction-sop/templates/*.json` 在仓库外；`git log --diff-filter=A -- "*templates/*.json"` 零条。换机器/换同事 = 必然重新造包，造法还不统一
2. **「库已发布 → 生成包」这条路采不到章节外壳**：`compile/geometry.ts:63` 的 `captureGeometryFromKeys` 调 `captureGeometry` 时不传 `sectionSourceId` / `sourceRootId` / `badgeSourceId`（连接口里的 `sourceBackend` 都是死参数），所以 `sectionShell` 永远缺、`docBackground` / `bubbleGrid` 也拿不到
3. **缺了不吭声**：`template-config.ts:212` 的 `incomplete` 只检 `components.top/chapter/cluster`；`capabilities` 缺省静默填默认值（`schema.ts:305`）；渲染返回体只回显 `components` / `capabilities`（`render.ts:816`），不含 `geometry`，也没有任何 warning

同时，用户明确指出：**「缺字段」不能算错**——不同项目的模板结构本来就可能不同，确实可能用不到某些字段。所以校验不能建立在「字段必填」上。

## What Changes

- **基线包随引擎分发**：新增 `packages/figma-mcp-server/assets/packs/`，随包提供 `default.json`（官方 1.14）与 `蛋仔派对.json`。查找顺序追加两个只读候选（用户包优先，保持可切换）：
  `env` → `<cwd>/.interaction-sop/template.json` → `~/.game-interaction-sop/templates/<project>.json` → `~/.game-interaction-sop/templates/default.json` → **`<引擎>/assets/packs/<project>.json`** → **`<引擎>/assets/packs/default.json`**
- **基线包必须是「完整包」**：含 `capabilities`（实测值）、`geometry`（`docBackground` / `sectionShell` / `placeholder` / `bubbleGrid` / `docPadding` / `footerGap` / `mainImage` / `chapterWidth`）与 `source.fingerprint`
- **key 失效显式报错**：基线包里的 `componentKey` 会随库重新发布而变；import 失败时报 `V2_TEMPLATE_KEY_STALE`（附 key 与 pack 路径），SHALL NOT 落回 `Cannot connect` / 找不到节点的模糊错误
- **渲染期后果自检（第一批两条，均为软告警）**：
  - `W_TEXT_CONTRAST_LOW`：正文文字与其最近实心背景的对比度低于阈值（默认 3.0，`GISOP_CONTRAST_MIN` 可配）
  - `W_PACK_GEOMETRY_DEFAULTED`：本次用了默认观感（缺 `docBackground` 或 `sectionShell`），message 点名缺哪项、影响什么
- **体检内核 + 排查工具**：自检逻辑落在 `packAudit.ts`，渲染期跑「快检」，另提供只读工具 `audit_template_pack` 跑「全检」（字段体检 + 后果自检 + 指纹比对），两边共用同一套判据与文案
- 缺字段本身 SHALL NOT 判错、SHALL NOT 阻断渲染（用户决策）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `template-contract`: 模板包解析顺序追加「随包分发基线」；基线包内容要求（完整 geometry + capabilities + fingerprint）
- `template-render`: 新增渲染期后果自检（对比度 / 观感缺省），以及 key 失效的专属错误码

## Impact

- `src/v2/template-config.ts`：候选列表追加 bundled 两个 origin（`bundled-project` / `bundled-default`）；`incomplete` 判据不变
- `src/v2/template/schema.ts`：`PackCandidateOrigin` 扩展；解析不新增必填
- `src/v2/pack-audit.ts`（新增）：字段体检 + 后果自检内核
- `src/v2/render.ts` / `src/v2/render/parts/index.ts`：渲染收尾调用快检，warning 并入返回体
- `src/server/figmaConsoleBackend.ts`：读取正文 fill / 章节根 fill 的批量能力（复用 `readPaints` / `scanSubtree`）；key import 失败映射 `V2_TEMPLATE_KEY_STALE`
- `src/server/createServer.ts`：新增只读工具 `audit_template_pack`
- `assets/packs/`：两套基线包（需先重编产出，见 tasks）
- 文档：`docs/INSTALL.md`、`SETUP.md`、`packages/skill/references/template-contract.md`、`packages/skill/phases/phase4-figma.md`
- **不在本次范围**：模板包切换的交互体验（用户明确后置）

## 已知缺口（必须写在 release note）

- 现有能拿到的官方 1.14 key 集合缺 `placeholder` / `bubbleGrid` / `docPadding` / `footerGap` 原值 → 首版基线包这些字段为空，靠引擎默认值；补齐需按 tasks 里的重编流程产出
- 蛋仔基线包当前机器上不存在，需重新编译产出
