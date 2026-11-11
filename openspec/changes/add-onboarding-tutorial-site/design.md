## 读者与验收

读者只有一个：没碰过这个仓库的新人，第一次装，机器在内网。其中一部分是设计师，不写代码。

验收一句话：**把 `index.html` 发给这个人，不再补充任何口头说明，他能自己装通、跑完一次、出错时自己查到原因。**

所以判断内容是否需要写，问一句"他卡在这里会不会停下"。会停就写，不会就删。

## D1 六页结构，按读者问的问题排

| 页 | 读者的问题 | 内容来源（页顶必须标注） |
|---|---|---|
| `index.html` | 这是干什么的 | `README.md` 的 What you get / How it works、`V2.md` |
| `01-quickstart.html` | 我怎么用起来 | `SETUP.md` 步骤 1–5、`phases/phase0`–`phase6` 的阶段说明 |
| `02-focus.html` | 交付前勾什么 | `phases/phase4-figma.md` 的收尾断言、`references/anti-patterns.md` |
| `03-assets.html` | 文风和模板归谁管，放哪 | `references/style-mod-schema.md`、`references/template-compile.md`、`references/template-contract.md`、`references/pattern-schema.md` |
| `04-troubleshoot.html` | 报错了怎么办 | 引擎源码里的错误码、`packages/figma-mcp-server/docs/figma-mcp-pitfalls.md` |
| `appendix-markdown.html` | 我要手改，怎么写 | `references/markdown-v2-spec.md`、`samples/蛋仔派对-局内道具拾取.md` |

安装和首跑合并的理由：没人先读完安装再动手。真实动作是装到一半就去试，试不过回来接着装。拆两页只会让人来回翻。

设计师内容不单独成页，而是放进 `02-focus`。设计师问的"给什么图、审什么"本身就是"要盯的地方"，按人群拆会重复讲同一件事。

## D2 完全自包含

标准：整个 `docs/tutorial/` 拷到没网的机器，双击 `index.html`，排版、配色、图、导航和联网时一模一样。不引外部字体、图标库、CDN，图全部用 HTML + CSS 画。

代价是图的精细度受限，接受。这个站的作用是让人装起来，不是展示设计能力。

## D3 图是主内容，不是配菜

每章至少一张离开正文也能看懂的图。写的时候先画图，图说不清的再用文字补。

五张核心图：

| 图 | 在哪 | 画什么 |
|---|---|---|
| 流水线图 | index | 策划文档 → 对话澄清 → Markdown → 配图 → Figma 文档，每段标输入和产物 |
| 分工图 | index | 人、AI、引擎、Figma 四方各干什么，谁调用谁 |
| 六步安装图 | 01 | 六步竖排，每步右侧一个"成功标志"，读者能自己对 |
| 三条支路图 | 02 | 有设计稿 / 没设计稿 / 中途要改，各走哪条 |
| 项目资产地图 | 03 | `<项目根>/.interaction-sop/` 下四类文件各是什么、谁写、什么时候生效 |
| 模板包流程图 | 03 | 粘 → 干跑 → 实跑 → 人点发布 → 登记，标出两处人工介入点 |
| 报错定位图 | 04 | 决策树：先按现象分类（环境 / 模板 / 内容），再落到具体错误码 |

配色只用两色：深灰线条，加一个强调色。强调色只用在关键路径和容易出错的节点。不做装饰性插图，说明书里没用的图就是噪声。

## D4 说明书口吻，避开 AI 腔

写的时候守这些：

- 一句话说一件事。能写成两句就别用逗号串
- 每条命令后面写"成功长什么样"，比如"看到 `dist/server/index.js` 就对了"
- 报错直接引原文：错误码、界面上的原话，不改写
- 不用 emoji，不用弯引号，不用长破折号
- 不写"需要注意的是""值得一提的是""总的来说"这类过渡句
- 不写"赋能、闭环、一站式、无缝、极致、全面"这类词
- 不用三连排比凑分量。两件事就写两件
- 不写"我们可以看到""让我们"，直接说事
- 表格优先于长段落。能列成"现象 / 原因 / 怎么办"的就不写散文

反例与正例：

```
✗ 通过以上步骤，您就可以轻松完成环境配置，享受高效的文档生成体验了。
✓ 装完这五步，就可以让 AI 生成第一份文档。

✗ 如果遇到问题，请注意检查环境变量是否正确配置。
✓ 一直报 V2_BACKEND_UNAVAILABLE，说明漏了 FIGMA_BACKEND=figma-console。
```

## D5 缺图用框线示意，不伪造

Figma 成品截图目前没有。处理方式：用 CSS 画出"气泡 + 说明块 + 配图占位"的结构，旁边小字写清"这里该有 M1 渲染结果截图"。

禁止：拿不相干的图凑数、画一张"大概长这样"的假界面。读者按假图找按钮，比没图更糟。

终端输出一律贴文本，不用截图：能复制、能搜索、体积小。

## D6 版本信息放页脚，不占顶部

每页底部固定一行：对应版本（仓库 / skill / 引擎三个号分列）和说明书日期。

三个版本号分开写，因为它们各自迭代（`package.json` 2.3.3、`packages/skill/manifest.json` 2.4.1、`ENGINE_VERSION` 0.4.2）。写成一个「v2.4」会误导人。

顶部不放「内容抄自哪个文件」这一块：读者打开页面第一眼应该看到内容，不是元信息。过期问题靠页脚版本号和一句「以仓库实现为准」兜。

## D7 安装只写一条主线

主线：取仓库 → 编译引擎并安装 skill（同一步）→ 在 CodeMaker 加一个 MCP 服务 → 拿 Figma Token → 启动连接插件。验证不做成独立一步，装完直接说「到这一步就装完了，想验证就调一次列出打开的文件，不想验证直接开始」。其他 AI 工具、自带模板、仓库更新这三件事与主线无隶属关系，统一收进「其他事项」。

必须写清两条，漏了必然失败：
- 只配一个 MCP 服务。以前配过独立 `figma-console` 的要删掉
- `FIGMA_BACKEND=figma-console` 不能省

## D8 报错页按撞上的概率选，不按错误码表顺序

初版收录：

| 现象 | 错误码 |
|---|---|
| 渲染一直失败，工具列表缺 figma 相关工具 | `V2_BACKEND_UNAVAILABLE` |
| 找不到 Figma 文件 / 桥接断开 | `V2_BRIDGE_DOWN`、`V2_TARGET_FILE_UNREACHABLE` |
| 模板地址指错 | `V2_ROOT_NOT_FOUND`、`V2_TEMPLATE_NODE_MISMATCH` |
| 模板在另一个文件 | `V2_TEMPLATE_OTHER_FILE`、`V2_TEMPLATE_FILE_UNREACHABLE` |
| 用了 `- @策划：` 但目标文件没有职能标记 | `V2_ROLE_BLOCK_UNAVAILABLE`、`V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE` |
| Markdown 结构不合法 | `V2_VALIDATE_INPUT_SCHEMA`、`V2_RENDER_INPUT_SCHEMA` |
| 阶段没走完就想进下一步 | `V2_SIGNOFF_*` 系列 |
| 声明了配图但没给资产（只是提醒） | `V2_W_FIGURE_ASSET_MISSING` |

其余上百个错误码不做教程内容，给一句指路：看 `packages/skill/references/anti-patterns.md` 和引擎自带文档。

## D9 交互只做三件降低操作成本的事

1. 命令块一键复制，`file://` 下不可用时退化为选中文本
2. 报错条目折叠：默认只显示现象和错误码
3. 可打印

不做页内章节锚点与阅读进度。左侧只留六个页面的导航，够定位、不喧宾夺主；页内靠上一页 / 下一页和页头返回首页。

不做阅读进度、全文搜索、页内实时解析 Markdown。最后一个等于把引擎搬进浏览器，必然随引擎版本坏掉。

## D10 项目资产章分两层：先"不用管"，再"要管"

如果每个新人都被告知"先建文风包、先编译模板包"，说明书就废了。所以这一章的结构是固定的两段：

**第一段：你现在不用管。** 文风一个文件都没有时，skill 自带 `references/style-default.md` 兜底，开箱可用。模板包找不到时回落到默认地址。这两条必须写在最前面，否则读者会以为必须先做配置。

**第二段：要管的时候怎么办。** 每类资产都回答三个问题：谁写、什么时候生效、不管它会怎样。

事实必须写准，这几条不准就会误导：

| 资产 | 位置 | 谁写 | 生效时机 |
|---|---|---|---|
| 项目基线文风 | `.interaction-sop/style.md` | 人 | 没有 own、也没有 `style_<名字>` 时 |
| 个人文风 | `.interaction-sop/style_own.md` | Phase 5 | 存在即默认生效 |
| 导入/分享文风 | `.interaction-sop/style_<名字>.md` | 导入或选中沉淀 | 存在任意一份 → 每份文档先问用哪份 |
| 本项目模板包地址 | `.interaction-sop/template.json` | 人 / 编译登记 | 引擎查找顺序第二顺位 |
| 写法边界 | `.interaction-sop/md-contract.md` | 由模板包推导 | 写 Markdown 前读 |
| 对比基线 | `.interaction-sop/snapshots/` | Phase 2 | Phase 5 做 diff |
| 模式库 | `.interaction-sop/patterns/` | Phase 6 | Phase 0 检索 |

文风选择顺序（先命中先停）：有任意 `style_<名字>.md` → 每次写文档前问一次；只有 `style_own.md` → 直接用；只有 `style.md` → 直接用；一个都没有 → 用 skill 自带默认。沉淀只有一个出口（Phase 5），一次最多 5 条，`style.md` 任何情况下不写入。

模板包查找顺序（先命中先停）：`GISOP_TEMPLATE_PACK` 环境变量 → 当前目录 `.interaction-sop/template.json` → `~/.game-interaction-sop/templates/<项目名>.json` → `default.json`。四条都没有时报 `V2_TEMPLATE_PACK_MISSING`。

模板包只写流程图加四个卡点，逐步命令指到 `packages/skill/references/template-compile.md`：

1. 粘错或漏粘到 `_staging`，报 `V2_COMPILE_STAGED_PART_MISMATCH`
2. 编译完没人在 Figma 的 Assets 面板点发布，报 `V2_COMPILE_NOT_PUBLISHED`
3. 组件名以 `_` 或 `.` 开头，Figma 归入 Hidden 不发布，报 `V2_COMPILE_UNPUBLISHABLE_NAME`
4. 冒烟要在空沙盒文件里跑，在源文件里跑会因引用成环超时，报 `V2_COMPILE_VERIFY_UNAVAILABLE`

重编纪律单独一段：用 `-v2` / `-v3` 追加新组件，不原地改、不删旧组件，否则已交付的文档会连带失效。

`md-contract.md` 单列一段，因为它是"写 Markdown 前的边界"：`clusterGroups=none` 就不能写 `####`，`overview=none` 就不能写总览。违反不会渲染出一半，而是在建画布前直接拒绝。

## 待定

1. `appendix-markdown.html` 用 `samples/蛋仔派对-局内道具拾取.md` 的哪几段做真实对照。贴全文太长，贴一段可能前后不接。
2. 入口链接加在哪：`README.md` 顶部、`SETUP.md` 顶部，还是两处都加。倾向两处各一行。
3. `index.html` 是否写清"这套东西不做什么"（不做视觉设计、不替代策划的需求文档）。倾向写三行，避免预期错位。
4. 资产章是否说明"一个项目只能挂一套模板包"（多套模板未支持）。倾向在模板包那段末尾用一行说明，避免读者自己试。
