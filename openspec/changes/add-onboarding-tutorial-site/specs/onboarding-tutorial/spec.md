## ADDED Requirements

### Requirement: 说明书站可断网浏览

站点 SHALL 由 `docs/tutorial/` 下的静态文件组成，SHALL NOT 引用任何外部域名的样式表、脚本、字体或图片。全部页面 SHALL 能通过 `file://` 直接打开且显示一致。

#### Scenario: 内网机器打开首页

- **WHEN** 把 `docs/tutorial/` 拷到无外网机器，双击 `index.html`
- **THEN** 排版、配色、示意图、导航 SHALL 与联网时一致，控制台 SHALL 无资源加载失败

#### Scenario: 不依赖构建

- **WHEN** 仓库未执行 `npm install` 或 `npm run build`
- **THEN** 站点 SHALL 仍可正常浏览

### Requirement: 按读者问题组织的六页结构

站点 SHALL 包含 `index.html`（这是什么）、`01-quickstart.html`（最快上手）、`02-focus.html`（验收清单）、`03-assets.html`（项目资产）、`04-troubleshoot.html`（常见问题）、`appendix-markdown.html`（写法速查）六个页面，共用一份样式表。安装与首次运行 SHALL 合并在 `01-quickstart.html`，SHALL NOT 拆成两页；编译引擎与安装 skill SHALL 合并为同一步，安装主线固定为四步。

侧边栏 SHALL 只列六个页面，SHALL NOT 在页面内部再列章节锚点。

每页 SHALL 提供下一页、上一页与返回首页的入口。

#### Scenario: 新人按顺序读完

- **WHEN** 从首页点击"下一页"
- **THEN** 顺序为 01 → 02 → 03 → 04 → 附录，任一页都能一键回首页

#### Scenario: 装到一半要查命令

- **WHEN** 读者在执行安装命令时需要回看编译步骤
- **THEN** 该步骤 SHALL 与首次运行说明在同一页内，无需跨页查找

### Requirement: 每章至少一张可独立理解的图

每页 SHALL 至少包含一张不依赖正文叙述也能看懂主要信息的示意图。示意图 SHALL 用 HTML 与 CSS 绘制，SHALL NOT 依赖外部图片或图标库。装饰性插图数量 SHALL 为零。

#### Scenario: 只看图也能说出流程

- **WHEN** 读者跳过正文只看示意图
- **THEN** 他 SHALL 能说出这一章的主要流程或判断依据

#### Scenario: 图不依赖外链

- **WHEN** 断网打开任意页面
- **THEN** 所有示意图 SHALL 完整显示

### Requirement: 视觉只用深灰线条加一个强调色

站点 SHALL 使用深灰作为线条与正文颜色，并只引入一个强调色。强调色 SHALL 仅用于关键路径与易错节点，SHALL NOT 用于装饰。

#### Scenario: 强调色不泛滥

- **WHEN** 浏览任意一页
- **THEN** 页面内出现强调色的元素 SHALL 都对应需要读者注意的操作或风险

### Requirement: 文案遵守说明书口吻

文案 SHALL NOT 使用 emoji、弯引号、长破折号，SHALL NOT 出现"需要注意的是""值得一提的是""总的来说"这类过渡句，SHALL NOT 使用"赋能""闭环""一站式""无缝""极致"这类词，SHALL NOT 用三连排比凑分量。

每条命令后 SHALL 说明成功时的现象。报错说明 SHALL 直接引用错误码与界面原文，SHALL NOT 改写为概括性描述。

#### Scenario: 命令行给出成功标志

- **WHEN** 读者执行编译命令
- **THEN** 页面 SHALL 说明成功后应看到 `dist/server/index.js`

#### Scenario: 报错引用原文

- **WHEN** 页面解释后端未启动
- **THEN** SHALL 直接写出 `V2_BACKEND_UNAVAILABLE` 并给出原因与修法

### Requirement: 页脚标注版本与日期

每页底部 SHALL 标注对应版本（仓库 / skill / 引擎三个号分列）与说明书日期。顶部 SHALL NOT 放出处块。

#### Scenario: 发现说明与实际不符

- **WHEN** 读者发现页面描述与实际行为不一致
- **THEN** 他能从页脚看到这份说明对应的 SKU 版本与日期，并知道以仓库实现为准

### Requirement: 安装章以 CodeMaker 为主线

安装章 SHALL 给出唯一主线：取仓库、编译引擎、安装 skill、在 CodeMaker 配置一个 MCP 服务、获取 Figma Token、启动连接插件、验证。其他 AI 工具的差异 SHALL 收在折叠块内，只给配置片段。

页面 SHALL 显式说明只配置一个 MCP 服务，以及 `FIGMA_BACKEND=figma-console` 不可省略及其缺失后果。

#### Scenario: 漏配后端变量

- **WHEN** 读者照主线完成配置
- **THEN** 页面中 SHALL 明确写出 `FIGMA_BACKEND=figma-console` 与漏配后的表现

#### Scenario: 使用其他 AI 工具

- **WHEN** 读者使用 Claude Desktop、Cursor 或 Cline
- **THEN** 折叠块 SHALL 提供对应 JSON 片段，且不重复讲述主线流程

### Requirement: 资产章先说明默认可用，再讲管理

项目资产页 SHALL 在开头说明：没有任何文风文件时使用 skill 自带的默认文风，找不到项目模板包时回落到默认地址，因此新人不需要先做配置。

页面 SHALL 逐项说明 `.interaction-sop/` 下文风包、模板包地址、写法边界、对比基线、模式库各自谁写、何时生效。文风选择顺序与模板包查找顺序 SHALL 各以一条完整顺序列出，SHALL NOT 只给结论不给顺序。

页面 SHALL 写明 `style.md` 任何情况下不被自动写入，以及重编模板包必须追加新组件、不删旧组件。

#### Scenario: 新人误以为必须先配置

- **WHEN** 读者打开资产页
- **THEN** 页面开头 SHALL 出现"不配置也能用"的说明及其依据

#### Scenario: 一份文档挑了哪份文风

- **WHEN** 项目里同时存在 `style_own.md` 与 `style_<名字>.md`
- **THEN** 页面 SHALL 说明每份文档开始前会询问选哪份，默认指向 `style_own.md`

#### Scenario: 模板包找不到

- **WHEN** 四个查找位置都没有本项目模板包
- **THEN** 页面 SHALL 给出 `V2_TEMPLATE_PACK_MISSING` 及四个查找位置的顺序

### Requirement: 写法边界文件必须被说明

资产页 SHALL 说明 `.interaction-sop/md-contract.md` 由模板包推导，内容决定当前项目能写哪些结构。页面 SHALL 给出至少一个具体例子（如不支持簇分组时不能写四级标题），并说明违反会在生成画布前被拒绝。

#### Scenario: 照别处写法被拒

- **WHEN** 读者从其他项目抄来包含四级标题的写法，而本项目模板不支持簇分组
- **THEN** 他 SHALL 能从资产页查到原因与对应文件

### Requirement: 验收页以可视化清单呈现

验收页 SHALL 由带勾选框的分组清单构成，每项 SHALL 包含「勾什么」与「怎么判断」。页面 SHALL NOT 再用整段文字讲解流程内部机制。

#### Scenario: 交付前逐项勾

- **WHEN** 文档已写入 Figma，读者要判断能否交付
- **THEN** 他 SHALL 能按内容、配图、成品三组逐项勾选，勾不上的即为待改项

### Requirement: 资产页先解释再管理

资产页 SHALL 先说明文风、模板、模式库各自是什么、解决什么问题，再说明如何配置与如何维护，最后才讲文件位置与优先级等细节。

#### Scenario: 第一次听说这些资产

- **WHEN** 读者不知道文风和模板分别管什么
- **THEN** 页面 SHALL 在前半部分用一句话分别说清三者管什么，以及它们互不影响

### Requirement: 常见问题按发生概率筛选

常见问题页 SHALL 收录安装与首次运行阶段最可能出现的错误，每条 SHALL 包含现象、错误码、原因、修法。页面 SHALL 说明未收录错误的查阅位置，SHALL NOT 以穷举错误码为目标。

#### Scenario: 遇到未收录的错误

- **WHEN** 读者碰到页面未列出的错误码
- **THEN** 页面 SHALL 指明后续查阅位置

### Requirement: 缺失素材以示意图代替，不伪造

页面 SHALL NOT 展示无真实来源的截图。无法获取的界面或产物外观 SHALL 用样式绘制的示意图表示，并在旁注明此处应有何种截图。

#### Scenario: 缺少 Figma 成品图

- **WHEN** 需要展示渲染结果但没有截图
- **THEN** SHALL 用示意图呈现结构，并标注该截图的应有内容

### Requirement: 命令块可一键复制

命令代码块 SHALL 提供复制按钮。剪贴板接口不可用时 SHALL 退化为可手动选中，且 SHALL NOT 产生未捕获错误。

#### Scenario: 本地文件打开时复制

- **WHEN** 通过 `file://` 打开页面并点击复制
- **THEN** 命令 SHALL 进入剪贴板，或退化为已选中状态，页面 SHALL 无报错
