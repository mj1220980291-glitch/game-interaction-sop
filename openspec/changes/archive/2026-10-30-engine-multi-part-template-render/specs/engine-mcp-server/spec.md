## ADDED Requirements

### Requirement: 编译工具的契约生成阶段

`figma_compile_template` SHALL 接受 `phase: "compile" | "verify" | "contract"`。

`phase = "contract"` SHALL 只读已登记模板包，返回 `md-contract.md` 正文与建议路径，SHALL NOT 连接 Figma、SHALL NOT 写入任何节点或配置文件。

`phase = "verify"` 的报告 SHALL 除组件 key 外同时返回 `mdContract: { path, content }`。

#### Scenario: 只读生成契约
- **WHEN** 以 `phase = "contract"` 调用且项目已登记模板包
- **THEN** 返回结果 SHALL 含契约正文，且后端 SHALL 记录到零次调用

#### Scenario: 未登记项目
- **WHEN** 以 `phase = "contract"` 调用但该项目没有模板包
- **THEN** 工具 SHALL 返回明确错误并提示先编译，SHALL NOT 编造模板能力
