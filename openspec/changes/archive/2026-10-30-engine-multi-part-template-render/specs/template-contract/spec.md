## ADDED Requirements

### Requirement: 统一槽位命名

归一化模板的内部槽位 SHALL 使用固定名字，名字是契约的一部分，不由项目原有图层名决定。

| 部件 | 槽位名 |
|---|---|
| `top` | `文档标题` `设计师名称` `需求组名称` `易协作单号链接` `更新时间` `功能背景` `核心交互` |
| `chapter` | `#Name` `主图占位` `主图占位文案` `气泡` `标号/母版` `Text` |
| `cluster` | `Number` `#Title_Main` `#Title` `正文/规则` `配图` `配图占位` `配图占位文案` `职能标记` |

改名 SHALL NOT 改变节点外观、类型、尺寸、层级或相对坐标；SHALL NOT 写入项目源模板。

关键槽位缺失的归一化模板 SHALL 被视为不可接：`chapter` 需 `主图占位` / `Text`，`cluster` 需 `Number` / `#Title_Main` / `正文/规则`。

章节标题 `#Name` SHALL NOT 列为关键槽位：部分项目的章节标题是共用的一块（不在章节部件里），缺失只影响标题文案，记缺口即可。

#### Scenario: 改名不影响外观
- **WHEN** 编译把 `798:17608` 的 `Group 2360` 改名为 `#Name`
- **THEN** 该节点的位置、尺寸、样式与父级 SHALL 与改名前一模一样，且源模板文件指纹不变

#### Scenario: 非统一命名的部件被拒
- **WHEN** 模板包的部件里找不到 `chapter.Text`
- **THEN** 渲染 SHALL 拒绝并提示重编，SHALL NOT 按形状猜一个容器顶替
