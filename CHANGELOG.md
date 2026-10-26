# CHANGELOG

## v2.2.1 — 2026-10-26

SOP 增加文风沉淀闭环（新 Phase 5），文风文件改成三角结构，Figma 连接插件改以社区插件为首选。Skill `2.2.1`，引擎仍为 `0.2.0`（无引擎代码改动）。

### 1. 新增 Phase 5 · 文风沉淀（原 Phase 5 模式库顺延为 Phase 6）

**是什么**：Phase 4 交付完成后统一收口，把这一轮被人工改过的**表述**沉进文风文件。两个入口：

- **md 入口**：Phase 2 保存 Markdown 时同时落基线快照 `<项目根>/.interaction-sop/snapshots/<需求名>.md`；Phase 5 用「快照 vs 现行 md」diff，只提取表述层改动（措辞 / 句式 / `@职能` 标注 / 动效句 / 红点四要素 / bullet 粒度），归成条目后**列清单一次确认**
- **Figma 入口**：主动问一句「你在 Figma 里改过表述吗」，用户给链接 / node 后读回文本，与快照逐条比，结论合并进同一张清单

**为什么合并**：原 Phase 2 / Phase 4 各有一道回写闸门，审核轮里反复追问；现在只在 Phase 5 问一次。

**写入规则**：写前备份 `.bak`，只改涉及字段与正文段；`style.md` 任何情况下不写入。

### 2. 文风文件三角结构

| 文件 | 角色 | 写入方 |
|---|---|---|
| `style.md` | 项目默认干净基线，只读 | 仅人工 |
| `style_own.md` | 个人文风，存在即默认生效 | Phase 5 自动沉淀 |
| `style_<name>.md` | 他人 / 分享 / 导入 | 导入，或本次被选中时沉淀 |

选择顺序：只有 `style.md` → 用它；有 `style_own.md` → 用它（不问）；存在任意 `style_<name>.md` → **每份文档问一次用哪份**（默认 `style_own.md`）；一个都没有 → skill 默认文风。首次沉淀以 `style.md` 为基底复制出 `style_own.md`。

契约见 `packages/skill/references/style-mod-schema.md`。

### 3. Figma 连接失败优先社区插件

`figma_list_open_files` 返回 `No files connected`，或渲染报 `V2_BACKEND_UNAVAILABLE` / `V2_TARGET_FILE_UNREACHABLE` 时，先让用户在目标文件里启动
<https://www.figma.com/community/plugin/1695400514520991057>（**网页端即可，不必装客户端**），起不来再回退本地 Desktop Bridge。SKILL.md 全局原则、phase3、phase4、SETUP.md、INSTALL.md、引擎 README 已同步。

### 4. 其他

- `phases/phase5-extract.md` → `phases/phase6-extract.md`，内部 Phase 编号、`deviation-schema` / `index-schema` 引用同步
- `phase3-asset.md` 新增「母版必须放子版」：`COMPONENT` / `INSTANCE` / `COMPONENT_SET` 主图一律 `figma_instance`，`COMPONENT_SET` 先选定变体
- `manifest.json` `engineVersion` 修正为 `^0.2.0`（原先 `^0.1.0` 覆盖不到实际引擎 `0.2.0`）
- 文档同步：根 `README.md`、`packages/skill/README.md`、`agents/openai.yaml`、`V2.md`、`openspec/specs/project-pattern-library/spec.md`

---

## v2.0.0 — 2026-10-23

本次把 SOP 从「必须在本文件渲染」推进到「库引用 + 职能描述 + 文风可学习」。引擎同步升到 `0.2.0`。

### 1. 库引用模式：任意 Figma 文件直接生成，主图保留母版子版关联

**是什么**：模板与「职能标记」发布到组件库后，引擎按 `componentKey` / `variantKeys` 用 `importComponentByKeyAsync` 导入实例。目标文件不再需要预先放模板，只要该文件能访问组件库。

**配置**（`~/.game-interaction-sop/template.json`）：

```json
{
  "template": { "componentKey": "<模板组件发布 key>" },
  "roleBlock": {
    "variantPrefix": "职能标记=",
    "labelTextName": "文本",
    "variantKeys": {
      "程序": "<key>", "GUI": "<key>", "拼接": "<key>",
      "美术": "<key>", "动效": "<key>", "音频": "<key>", "策划": "<key>"
    }
  }
}
```

**实现要点**：

- `target.fileKey` 可省略（写当前活动文件），库引用模式下不再探测目标文件里的模板节点
- 导入的模板实例在 Figma 里是只读结构，引擎先 `detachInstance()` 再填充；detach 会**换节点 id**，渲染全程使用返回的新 Frame
- `roleBlock.variantKeys` 支持别名：`音效 → 音频`、`vx/VX/特效 → 动效`、`开发 → 程序`

**主图用真实实例（`figma_instance`）**：新增 asset 类型，取源节点（COMPONENT 用 `createInstance`，INSTANCE 用 `clone`），挂到 `主图占位` 的父级 `rec组`，等比缩放并居中，删除占位矩形。文档里保留的是**母版的粘贴子版**，不是栅格图片；后续可直接在 Figma 改实例覆盖。

```json
{
  "01": { "type": "figma_instance", "fileKey": "…", "nodeId": "523:7289" },
  "02": { "type": "figma_instance", "fileKey": "…", "nodeId": "523:7288" }
}
```

**图片路径**：插件沙箱无法 `fetch` `file://` 和 `localhost`，`image` 类型的本地路径由引擎服务端读文件转 `data:` URI 后再交给插件。

### 2. `- @职能：正文` 条目：按职能单独成条

**写法**：

```markdown
- @策划：标记类型清单、默认类型、呼出阈值走配表
- @音频：标记落地时播放标记提示音
- @动效：标记落地时图形快速放大落定
```

**规则（T11）**：

- 一个职能一条；两个职能拆两条
- 普通 bullet 不夹带职能归属（"（策划配表）"这类要拆出去）
- 正文自包含，不写"同上""见上一条"
- 不放角色名本身（`@策划：策划负责…` 错）
- 归属不明回 Phase 1 问，不猜

**渲染**：按变体名匹配（`职能标记=#策划` / `职能标记=策划`），原位生成组件实例并写正文 TEXT；实例名统一还原为 `职能标记=<角色>`，保证同步模式可识别。缺组件集或缺变体直接报 `V2_ROLE_BLOCK_UNAVAILABLE`，不静默降级。

### 3. 文风 mod：影响生成的表述方式

**位置**：`<项目根>/.interaction-sop/style.md`（契约见 `packages/skill/references/style-mod-schema.md`）

**三组字段**：

| 组 | 作用 |
|---|---|
| `verbosity` | 精简 / 常规 / 啰嗦；每簇 bullet 数量区间 |
| `role_annotation` | `always / selective / never`；哪些内容该写 `@职能`、哪些不写 |
| `wording` | 语气、人称、长短句、术语替换、禁用词 |

**优先级**：可覆盖 T1 / T3–T9；不可覆盖引擎硬校验（H*/C2）、状态行规则（T10/W7/W8）、T2 丢弃判据。冲突时保留不可覆盖项。

### 4. 修改回写：文风 mod 会学习你的修订

**循环**：

1. 我产出 Markdown
2. 你直接改文档
3. 我对「AI 稿」与「你的修订稿」逐条 diff
4. 把可复用差异写回 `style.md`（一次最多 3 个字段，避免过拟合）
5. 追加「学习记录」：来源、学到什么、落到哪个字段

已积累的规则示例：

- 动效句必须写成 `- @动效：` 条目，不用簇末无前缀句
- 角色 token 只写 `@动效`，口语 `@vx` 不落文档
- 轮盘 / 按钮等界面图标归 `@GUI`，`@美术` 只管立绘、模型、材质、特效

---

### 兼容与回退

- 旧配置（`template.fileKey` + `nodeId`、`roleBlock.componentSetId`）继续可用；删掉 `componentKey` 即回退到同文件模式
- 同步模式（`rootId`）继续支持；本次修复了测试读取开发者本机配置的问题（`GISOP_TEMPLATE_CONFIG=off`）

### 已知限制

- 组件库必须已发布，且目标文件所在团队可访问
- 变体命名须以 `职能标记=` 开头（后缀可带 `#`）
- `配图：`（`NN/C/K`）目前只支持 `figma_node` / `skip`，不支持本地图片与实例
- 库引用模式下模板实例会被 detach，文档与模板后续改动不再联动
- 职能块的实例内部文本暂不参与同步字符比对，会以 `preserved / hand-edit` 出现在同步报告里
