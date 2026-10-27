## ADDED Requirements

### Requirement: 归一化模板归属

归一化模板 SHALL 归本引擎维护，SHALL 存放于我们自己的库文件；项目源模板仅作为编译输入。

归一化模板中的**任何**组件引用 SHALL 指向本库自有组件，SHALL NOT 指向项目源文件或第三方库的组件 key。

源模板被修改、重命名或删除后，已发布的归一化模板 SHALL 保持可用，SHALL NOT 出现占位或灰框。

#### Scenario: 源文件删除后仍可用
- **WHEN** 项目源模板文件被删除
- **THEN** 已发布的 4 个部件 SHALL 仍能按 key 导入并正常显示

#### Scenario: 后续维护以归一化模板为准
- **WHEN** 需要调整部件的图层结构或样式
- **THEN** 改动 SHALL 在库文件中的归一化模板上进行，SHALL NOT 依赖源模板重新编译

### Requirement: 能力描述归一化模板

`template.json` 的 `capabilities` SHALL 描述归一化模板（即渲染时实际 import 的那棵树）的结构，SHALL NOT 描述项目源模板的结构。

编译流程 SHALL 以对归一化模板产物的探针结果为准；与源模板探针结果的差异 SHALL 显式报告。

#### Scenario: 配置与实际结构一致
- **WHEN** 渲染读取 `capabilities.numberBadge`
- **THEN** 该值 SHALL 与归一化模板产物中编号载体的实际形态一致
