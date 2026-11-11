## Why

现在想上手这个项目的人，得同时看三个地方才能装起来：`SETUP.md` 讲安装，`README.md` 讲流程，`packages/skill/phases/*.md` 讲每个阶段到底干什么。三处都是长文字，没有一处是"从头照着做一遍"的路径。

而且三处已经开始互相矛盾：`SETUP.md:10` 写「Phase 0–5 的 Markdown 指引」，实际 `packages/skill/manifest.json` 登记了 7 个 phase 文件，一直到 Phase 6。新人看到这句会以为流程到 Phase 5 就结束。

另一个问题更基础：这三份东西是写给 AI 读的。设计师打开 `phase3-asset.md`，看到的是对话指令，不是"你该准备什么"。人需要的是说明书，不是提示词。

所以要做的是**一本说明书**，不是一套教程：它回答四个问题——这是什么、怎么最快用起来、哪里容易出错、出错怎么办。

## What Changes

- 新增 `docs/tutorial/` 静态站，6 个页面 + 1 个共享样式表：`index.html`（这是什么）、`01-quickstart.html`（最快上手）、`02-focus.html`（要盯的地方）、`03-assets.html`（项目资产怎么管）、`04-troubleshoot.html`（常见问题）、`appendix-markdown.html`（写法速查）
- 新增一章讲项目级四类资产：文风包、模板包、写法契约、模式库。先说明新人用默认值即可、不需要配，再讲需要管的时候怎么做。文风包写细（选、导入、分享、沉淀），模板包写卡点（何时重编、卡在哪、报错怎么处理），逐步操作指向 `references/template-compile.md`
- 安装和首次跑通合并成一章，因为没人会先读完安装再动手；读者是一边装一边试
- 每章至少一张能独立看懂的图，全部用 HTML/CSS 画（流程线、状态对照、位置示意图），不引任何外部图片或图标库
- 视觉只用两色：深灰线条 + 一个强调色，强调色只点在关键路径和容易出错的节点上
- 文案按说明书口吻写：一句话说一件事，每条命令后面写"成功长什么样"，报错直接引错误码原文。不用 emoji、不用弯引号、不写"需要注意的是"这类填充句
- 每页顶部固定标注内容出处（抄自哪个文件）和三个版本号，防止教程悄悄过期
- 安装只写 CodeMaker 一条主线，其他 AI 工具收进折叠块
- 报错页只收新人实际会撞上的十来条，不追求穷举

## Capabilities

### New Capabilities

- `onboarding-tutorial`: 说明书式教程站的结构、可视化要求、行文规范、来源标注与缺料处理

### Modified Capabilities

（无）

## Impact

- 新增：`docs/tutorial/index.html`、`01-quickstart.html`、`02-focus.html`、`03-assets.html`、`04-troubleshoot.html`、`appendix-markdown.html`、`style.css`
- 可能改动：`README.md`、`SETUP.md` 顶部各加一行入口链接，正文不动
- 不触碰 `packages/` 下任何代码，`npm run build` / `npm test` 行为不变
- 素材：`packages/skill/references/images/codemaker-mcp-setup.png` 可复用；`samples/蛋仔派对-局内道具拾取.md` 作为附录案例；Figma 成品截图缺失，用框线示意并在旁边写清"这里该有什么图"
