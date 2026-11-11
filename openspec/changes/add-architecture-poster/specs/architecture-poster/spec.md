## ADDED Requirements

### Requirement: 架构图独立可用

架构图 SHALL 是单个 HTML 文件，样式内联，SHALL NOT 引用任何外部资源。SHALL 能通过 `file://` 打开并完整显示。

#### Scenario: 拷走单独打开

- **WHEN** 只把这个 HTML 拷到另一台机器，断网双击打开
- **THEN** 布局、渐变、光晕、虚线 SHALL 完整呈现，控制台无报错

### Requirement: 五层结构与输入产出

图 SHALL 自上而下呈现五层：入口、编排层、引擎层、运行时、项目资产。每层 SHALL 含层名、一句角色说明与若干能力块。图 SHALL 单独标出输入项与产出项，并用连线指向对应层。

#### Scenario: 不看文字也知道层级

- **WHEN** 读者只看图
- **THEN** 他能说出哪层是入口、哪层负责执行、哪层是本机连接、哪层是项目自身文件

### Requirement: 引擎层为视觉重心

引擎层 SHALL 用深色填充与白色文字区别于其他层，并 SHALL 是图中最宽的一层。其余层 SHALL 使用浅色填充与深色文字。

#### Scenario: 一眼找到重心

- **WHEN** 读者扫一眼整张图
- **THEN** 视线 SHALL 首先落在引擎层，且能读出它承担的三项核心能力

### Requirement: 窄屏降级保留全部信息

视口宽度小于 1080px 时，SHALL 取消椭圆与绝对定位，改为纵向卡片排列；SHALL 保留全部层名、角色说明与能力块。仅隐藏装饰性的主线与虚线。

#### Scenario: 手机上阅读

- **WHEN** 用 390px 宽视口打开
- **THEN** 五层 SHALL 依次纵向排列，无横向滚动，能力块内容不丢失

### Requirement: 动效尊重系统设置

页面动效 SHALL 在 `prefers-reduced-motion: reduce` 时全部停止，内容不得依赖动画才可见。

#### Scenario: 关闭动效

- **WHEN** 系统开启「减弱动态效果」
- **THEN** 页面 SHALL 保持静态且信息完整
