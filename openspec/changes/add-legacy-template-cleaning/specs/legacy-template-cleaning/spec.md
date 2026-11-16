## ADDED Requirements

### Requirement: 旧稿识别 SHALL 基于四类证据并显式报告歧义

清洗流程 SHALL 对旧正式稿做有界局部扫描，按命名、局部层级、重复结构、相对位置与尺寸，并叠加文本与截图，输出部件候选、源节点映射与能力推断。每项能力 SHALL 附证据；实测推断与契约缺省 SHALL 分开标注；同一能力存在多个有效样式时 SHALL 全部报出并标冲突，SHALL NOT 静默择一混搭。仅在证据互相矛盾且截图无法判定时才请求用户确认，SHALL NOT 要求用户先手工挑选章节或簇。

#### Scenario: 名称与语义不一致
- **WHEN** 候选节点名为 `cell_comment`，但结构与截图显示它是说明簇
- **THEN** 报告 SHALL 以结构与截图为准标注其为说明簇，并记录命名与语义不一致的歧义

#### Scenario: 两种有效编号样式
- **WHEN** 旧稿存在红色定位编号与黄色方框编号两种有效样式
- **THEN** 报告 SHALL 同时列出两种样式与各自证据，SHALL NOT 只保留一种

### Requirement: 隔离提取 SHALL 复制整章外壳并在生成区幂等执行

清洗 SHALL 在独立副本执行，复制单位 SHALL 为整章外壳（卡片、圆角、底色、内边距、标题层级），SHALL NOT 只复制内部结构而丢失外壳。输出 SHALL 包含 1 章 + 1 状态 + 1 簇的最小可见集，独立部件 SHALL 另区展示而不与文档内容混排。重复执行 SHALL 替换本轮生成区，SHALL NOT 无限追加；失败 SHALL 只清理本轮生成资产，SHALL NOT 修改原稿或既有用户资产。

#### Scenario: 重跑同一旧稿
- **WHEN** 对同一旧稿连续执行两次清洗
- **THEN** 第二次 SHALL 复用或替换生成区，副本节点数量不得因重跑而持续增长

#### Scenario: 中途失败
- **WHEN** 清洗在替换文案阶段失败
- **THEN** 只 SHALL 删除本轮新生成的副本节点，源稿与 `_staging` 既有副本 SHALL 保持不变

### Requirement: 清洗 SHALL 覆盖名称、文本、链接与图像填充四处

清洗 SHALL 将标题、状态名、正文、人员、日期与联系方式替换为明确占位；SHALL 将主图与业务配图替换为等尺寸中性矩形与占位文案，业务图即使是组件实例也 SHALL 替换；SHALL 清除指向具体工单或个人主页的链接目标。清洗 SHALL 同时检查节点名、`characters`、`hyperlink` 与 `fills`，SHALL NOT 只改屏幕可见文字。审核记录、历史版本与隐藏旧稿 SHALL 移除；标志、固定操作说明、必要职能标签与有用途的隐藏样式母版 SHALL 保留，且每项 SHALL 附保留依据。

#### Scenario: 业务图是组件实例
- **WHEN** 旧稿某配图槽位放的是组件实例而非位图
- **THEN** 该实例 SHALL 被替换为等尺寸中性占位，SHALL NOT 因类型是 INSTANCE 而跳过

#### Scenario: 链接残留
- **WHEN** 占位文本替换完成后原节点仍保留指向内部工单的 hyperlink
- **THEN** 清洗报告 SHALL 判定为未完成，并清除该链接目标

### Requirement: 清洗结果 SHALL 通过真编译与全链验收才算交付

槽位归一化 SHALL 只在不破坏布局的前提下进行，簇的 `Number` / `#Title_Main` / 正文 / 职能载体 / 配图，章节的 `#Name` / 主图占位 / `Text` 说明栏 SHALL 可定位。归一化完成 SHALL NOT 视为交付：清洗结果 SHALL 依次通过 `phase=compile` 真编译、人工发布、独立沙盒 `phase=verify`、渲染与同稿同步。任一阶段失败 SHALL 记录该阶段为准，SHALL NOT 以前一阶段通过替代。

#### Scenario: 干跑通过但编译失败
- **WHEN** `phase=compile` 干跑返回计划正常，但真实编译报 `SLOT_UNMAPPED` 或 `RUN_CONTRACT_BROKEN`
- **THEN** 交付状态 SHALL 记录为编译失败，并附该阶段原始错误，SHALL NOT 报成"清洗完成"

#### Scenario: 验证导入未发布
- **WHEN** 独立沙盒 `phase=verify` 报告部件未发布
- **THEN** SHALL 报告为等待人工发布，SHALL NOT 自动重试或改写原稿

### Requirement: 清洗 SHALL 产出可复核回执

每次清洗 SHALL 产出回执，至少包含：源→副本映射、保留/替换/移除清单及依据、能力证据与歧义、整体与局部截图、各阶段验证状态。字体 SHALL 在副本与产物中统一 `Noto Sans SC`，并 SHALL 以截图证明替换引起的换行与尺寸变化可接受；原稿字体 SHALL 保持不变。

#### Scenario: 复核一次清洗结果
- **WHEN** 第三方拿到清洗回执
- **THEN** SHALL 能从回执判断哪些节点被保留、替换或移除及原因，并看到 compile / publish / verify / render / sync 各阶段结论
