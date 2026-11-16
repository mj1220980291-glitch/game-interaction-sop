## ADDED Requirements

### Requirement: readPaints SHALL 避开实例后代异步直查挂起

readPaints 对 `I<root>;...` SHALL 查询根实例，在子树按完整 ID 精确匹配，不调用完整实例后代 ID 的 getNodeByIdAsync；最多访问 20000 节点，超预算明确失败。普通 ID 继续异步查询，缺失跳过；mixed/非 SOLID 省略颜色。保持 nodeId/hex 返回契约、逐调用 fileKey 和原错，不加网络、重试或写入。

#### Scenario: 实例后代直查挂起
- **WHEN** 根实例及后代树可读，完整实例后代 ID 异步查询永久 pending
- **THEN** 从根子树精确定位后代并读真实 fill/stroke，不调用挂起入口

#### Scenario: 超预算与缺色
- **WHEN** 子树超预算或 paints 为 mixed/隐藏/非 SOLID
- **THEN** 超预算报错，合法缺色省略 hex；不将二者混为成功空结果

### Requirement: verify 错误 SHALL 标明阶段与绑定文件

verify SHALL 区分 smoke、geometry、spacing；backend execute 失败 SHALL 附实际绑定 fileKey，导入与实例化 SHALL 附组件 key 与脚本内阶段，保留原始错误和 code，不输出脚本、环境或 token。仅明确组件不存在 SHALL 分类 stale；连接措辞或超时 SHALL NOT 推断未发布或 key 失效。

#### Scenario: 四 key 导入成功后失败
- **WHEN** 沙盒四原子 smoke 成功，随后库实例化或源几何读取失败
- **THEN** 错误 SHALL 定位 geometry 及实际文件；实例化失败 SHALL 带 chapter key 和 import/create/parent/serialize 阶段，不归为 smoke 或笼统桥断连

#### Scenario: 临时实例创建后失败
- **WHEN** 实例创建后序列化/挂载失败，或几何采集后的清理失败
- **THEN** 脚本 SHALL 清理本轮实例；几何清理失败 SHALL 记录含实例 ID 的 gap，不静默宣称清理成功


### Requirement: 共享桥状态 SHALL 反映最近执行证据

proxy 与 backend SHALL 使用同一 MCP client；withFileKey SHALL 保持逐调用文件定向，不改变活动文件。backend 成功 execute SHALL 刷新 pluginConnected=true 与往返耗时；明确桥不可连接错误 SHALL 置 false。插件脚本中的导入网络错误 SHALL NOT 被当作桥断连证据。get_skill_requirements SHALL 保持只读快照，不主动导入或重连。

#### Scenario: 启动探活失败后插件恢复
- **WHEN** 启动缓存为 false，之后内部 probe 成功返回目标文件数据
- **THEN** 快照 SHALL 更新为 true；外部 execute 与内部请求 SHALL 到达同一 client，多个文件绑定 SHALL 互不串线

#### Scenario: 执行失败与健康结果判定
- **WHEN** MCP 返回 isError、success=false 或无 _mcp 的 error envelope
- **THEN** backend SHALL 抛出原始错误，不把错误对象当成功结果；healthCheck SHALL 仅接受 return 1 的真实结果
- **AND** importComponentByKeyAsync 的 “Unable to establish connection” 错误 SHALL NOT 抹掉已确认的桥成功往返


### Requirement: verify 冒烟 SHALL 逐部件可观测并在桥级失败时短路

`phase=verify` 的 import 冒烟 SHALL 逐部件记录 `{part, key, startedAt, elapsedMs, errorKind}`，并把摘要并入失败信息与结构化 details。`errorKind` SHALL 区分 `no-client`、`no-reply`、`busy`、`not-published`、`other`，分类依据原始错误文本或既有 `V2_BRIDGE_NO_REPLY`，SHALL NOT 因此新增 Figma 调用。

出现 `no-client`、`no-reply`、`busy` 任一桥级失败时 SHALL 立即停止后续部件，并在信息中标明未尝试的部件，SHALL NOT 把桥级失败表述为「各部件都不可用」或「未发布」。`not-published` SHALL 继续聚合并以 `V2_COMPILE_NOT_PUBLISHED` 上报。

桥级失败信息 SHALL 附带已有桥快照 `port / preferredPort / fallback / holderPid / pluginConnected / lastRoundtripMs / checkedAt / workerPid / supervisorPid`；SHALL NOT 为此发起额外往返，SHALL NOT 输出脚本、环境变量或 token。

#### Scenario: 目标文件没有插件客户端
- **WHEN** 首个部件的 import 返回 `Cannot connect to Figma Desktop.` 且 bridgeState 显示端口正常
- **THEN** 错误 SHALL 标 `no-client`、报 `V2_COMPILE_VERIFY_UNAVAILABLE`，其余部件标「未尝试」，并附桥快照
- **AND** SHALL NOT 继续对其余 key 逐个 import

#### Scenario: 多部件未发布
- **WHEN** 多个部件的 import 返回「找不到已发布组件」
- **THEN** SHALL 继续聚合全部 `not-published` 条目后以 `V2_COMPILE_NOT_PUBLISHED` 上报，SHALL NOT 被短路

### Requirement: verify SHALL 在冒烟前做一次有界就绪探活

`phase=verify` SHALL 在四键冒烟前执行一次 `verify.bridge` 阶段的有界探活（复用 backend `healthCheck` 的 `return 1`，插件超时 5s）。探活失败 SHALL 以桥级错误结束，SHALL NOT 进入部件循环；探活 SHALL NOT 等待插件重连、SHALL NOT 循环重试、SHALL NOT 改变 `verify.smoke` 的既有成功路径。

#### Scenario: 引擎刚重启插件尚未回连
- **WHEN** 目标是刚启动的 worker，插件尚未连上
- **THEN** SHALL 在 `verify.bridge` 明确失败并给出原始连接错误，SHALL NOT 报四个部件各自的导入失败

### Requirement: worker 启动 SHALL 自留生命周期痕迹

worker 启动 SHALL 追加一行 JSON 到 `~/.game-interaction-sop/worker-lifecycle.log`（可用 `GISOP_LIFECYCLE_LOG` 覆盖），包含 `pid`、`supervisorPid`（存在时）、`startedAt`、`engineVersion`、探活结论与原始错误摘要。写入失败 SHALL NOT 阻断启动、SHALL NOT 抛出到调用方。

#### Scenario: 宿主不收集 stderr
- **WHEN** 宿主换掉整个 MCP 服务且不转发子进程 stderr
- **THEN** 事后 SHALL 能从 lifecycle 文件读出每次 worker 的 pid 与启动时刻，用于核对宿主重启时间线

### Requirement: 组件变体模式下模板职能载体 SHALL 按 md 角色取舍

`roleAnnotation = component-variant` 时，渲染 SHALL 对簇内名称形如 `<variantPrefix><角色>` 的职能载体按本簇 `roles` 取舍：标注角色 SHALL 保持可见，未标注角色 SHALL 置为不可见（不删除）。仅名为 `<variantPrefix>`、不带角色后缀的容器 SHALL NOT 被隐藏。标注角色的正文 SHALL 以 md 为准：md 未给该角色正文时 SHALL 清空模板占位正文；md 用 `@角色：正文` 另建实例承载时，模板载体 SHALL 隐藏，避免同一角色出现两行。隐藏或清空失败 SHALL 只记软警告，SHALL NOT 使渲染失败，也 SHALL NOT 影响编号、标题、正文与配图。

#### Scenario: 模板预置了未标注的角色行
- **WHEN** 簇母版含 `职能标记=#程序`、`职能标记=#GUI`、`职能标记=#拼接` 三个可见实例，md 该簇只写 `@GUI`
- **THEN** 只有 GUI 行 SHALL 可见，其余两行 SHALL 不可见且节点保留；同步 SHALL NOT 因这两行产生冲突

#### Scenario: 纯容器不隐藏
- **WHEN** 簇母版只有一个名为 `职能标记` 的 FRAME（无角色后缀）
- **THEN** 该容器 SHALL 保持现状，不被隐藏或删除

#### Scenario: 隐藏失败
- **WHEN** 插件在设置可见性时超时或报错
- **THEN** 渲染 SHALL 继续，仅追加一条 `V2_W_ROLE_CARRIER_LEFT` 软警告

### Requirement: 编译自动排列 SHALL 限于本轮新资产

compile SHALL 按本轮 built/adopted/set ID 白名单排列，按目标 Page 合并去重；缺失或空白名单 SHALL 零写入。排列 SHALL 仅移动目标 Page 直属的新组件/集，SHALL NOT 提升嵌套成员到祖先或移动既有 Section、根资产及源稿。新产物 SHALL 排在既有根节点包围区之外；新建变体集内部 SHALL 合理排列。每项目独立 Page SHALL NOT 被当作此写入边界的替代。

#### Scenario: 同页编译保留旧资产位置
- **WHEN** library.pageId 与 partsPageId 相同，页面已有源稿、组件和项目 Section
- **THEN** 排列 SHALL 只调用一次，旧资产坐标、尺寸、父级 SHALL 与调用前一致；新组件及集 SHALL 不重叠

#### Scenario: 白名单不含可排列根节点
- **WHEN** 白名单缺失、为空或仅含未知/嵌套 ID
- **THEN** SHALL 不移动任何节点，不提升祖先；集内部成员 SHALL 保留其排列


### Requirement: 外部模板接入 SHALL 支持正规模板和正式稿两种起点

系统与接入流程 SHALL 支持正规模板直接编译，以及旧交互文档经隔离抽取清洗后编译。取得正规模板 SHALL NOT 取消正式稿清洗能力；只读推荐 nodeId SHALL NOT 被认作清洗完成。

#### Scenario: 两种燕云样本并存

- **WHEN** 用户同时提供正规模板与旧正式稿
- **THEN** SHALL 分别记录部件、视觉与能力依据，正规模板仅作骨架对照
- **AND** SHALL NOT 强行将旧稿的编号样式、列宽与职能排布改成正规模板的另一套合法风格

### Requirement: 正式稿抽取 SHALL 保留完整骨架并替换业务内容

抽取 SHALL 结合命名、层级、重复结构和截图识别候选；仅在无法判断的歧义上请求确认。写入 SHALL 在隔离副本进行，保留章节外壳、底色、圆角、内边距、标题/状态标题关系、布局和必要样式载体。业务文本、旧主图/配图、人员、日期、联系信息与具体链接 SHALL 替换为占位或移除；检查 SHALL 覆盖节点名、文本、链接及图像填充。有用途的隐藏母版 SHALL 保留，无关审核和历史内容 SHALL 移除。

#### Scenario: 旧稿的 sect 不含卡片外壳

- **WHEN** 候选 sect 位于章节卡片内部
- **THEN** SHALL 连同外壳及标题关系提取，不能只取内部 sect 导致卡片与内边距丢失
- **AND** 最小整篇预览与独立编译部件 SHALL 分区，不得重复显示样板簇冒充正文

#### Scenario: 完整卡片含标题、状态与嵌套左右列

- **WHEN** 章节输入为标题 Frame（含 #Name）、状态 TEXT、sect 横排（舞台含主图占位与气泡，Text 为右列）
- **THEN** 编译 SHALL 优先按明确槽位及一层嵌套布局定位两列，不得把 sect 当右列或状态当图
- **AND** SHALL 保留完整外壳、标题、状态、布局、列宽、内边距、底色、圆角、气泡与隐藏标号母版；主图替换为等尺寸中性占位，右列为空壳；副本文本统一 Noto Sans SC，原稿只读
- **AND** 重复或不完整的明确槽位 SHALL 报错；无明确槽位的既有直接左右布局 SHALL 保持兼容，尺寸候选不得包含标题或 TEXT
- **AND** 自动回归 SHALL 覆盖嵌套卡片与既有直接左右布局；写入回执 SHALL NOT 替代视觉验收

#### Scenario: 业务图片是嵌套实例

- **WHEN** 主图或配图由实例/组件构成，而不是裸矩形
- **THEN** 清洗 SHALL 替换业务视觉，不得只改图层名而保留旧图
- **AND** SHALL 保留明确需要的编号/职能样式，记录源节点到副本及保留/替换/移除依据

#### Scenario: 重复运行或中途失败

- **WHEN** 再次执行同一抽取或本次操作失败
- **THEN** SHALL 复用/替换当前生成区或清理本轮半成品，不无限追加
- **AND** SHALL NOT 修改原稿或删除源内组件与既有用户资产

### Requirement: 接入验收 SHALL 分阶段记录真实证据

能力 SHALL 标注实测、推断或缺省来源；槽位映射、入口干跑、视觉清洗、真编译、人工发布、独立沙盒导入、深审计、渲染与同步 SHALL 分别验收。

#### Scenario: 簇没有语义分组标题

- **WHEN** 候选只有簇标题和正文，没有可重复的分组标题
- **THEN** SHALL 根据实际结构确认 clusterGroups，不得直接套用 slot-run 后要求补 #Title
- **AND** 干跑 checks 全通过或 gaps 为空 SHALL NOT 证明嵌套正文、职能变体与配图渲染正确

#### Scenario: none 簇正文位于嵌套 text 宿主

- **WHEN** 编号与 text 容器并列，text 内含簇标题、多个正文、模板职能标签与配图，正文槽共享唯一宿主
- **THEN** SHALL 保留编号、标题与宿主布局，在正文自身宿主中按 IR 顺序渲染普通正文、合法职能实例与配图，包括无图多正文和长文
- **AND** SHALL 清理旧正文、配图和模板残留职能标签，SHALL NOT 删除承载正文或标题的容器
- **AND** GUI / 程序 / 拼接 SHALL 复用配置的职能变体；CCS 项目语义 SHALL NOT 成为全局别名；缺变体 SHALL 明确失败，不退化字面 @文本或 caps none
- **AND** 正文分散在不同宿主 SHALL 明确报错；扁平与 slot-run 既有行为 SHALL 保持兼容；自动回归与真机重复同步 SHALL 分别记录

#### Scenario: 视觉与端到端验收

- **WHEN** 清洗生成候选模板
- **THEN** SHALL 检查整篇与可读底色局部截图，确认顺序、外壳、列宽与留白
- **AND** SHALL 在非库文件的独立沙盒验证导入，渲染至少 2 章/3 簇样例，覆盖长短正文、配图和合法职能条目
- **AND** 两次相同同步 SHALL 无变更，单条正文修改 SHALL 局部更新，既有基线 SHALL 回归

### Requirement: 安装片段 SHALL 使用 node 绝对路径

仓库提供的安装片段（`scripts/install-mcp.mjs` 输出的一切形式：CodeMaker 表单、Codex TOML、`mcpServers` JSON、默认提示）SHALL 使用运行安装脚本时的 node 绝对路径（`process.execPath`），SHALL NOT 输出裸 `node`。

`SETUP.md` 的配置表 SHALL 与之一致，并说明「宿主 PATH 与 shell PATH 不一致时会出现 `spawn ENOENT`」。

#### Scenario: PATH 无 node 的机器

- **WHEN** 目标机器 PATH 里没有 node，按安装片段配置宿主
- **THEN** 宿主 SHALL 能拉起 MCP 进程（片段里是绝对路径），SHALL NOT 出现 `spawn ENOENT`

#### Scenario: 仓库挪位置

- **WHEN** 仓库路径变化后重新运行安装脚本
- **THEN** 输出片段中的 `args` SHALL 指向新路径，`command` SHALL 仍为当前 node 绝对路径
