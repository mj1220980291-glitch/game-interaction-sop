## ADDED Requirements

### Requirement: Phase 4 重渲染已有文档走同步模式

文档已经渲染到 Figma 后，如果需要再次写入（markdown 有修订，或补充配图），Agent SHALL 带 `target.rootId` 调用 `render_v2_markdown_to_figma`。SHALL NOT 新建一份文档，也 SHALL NOT 删除旧文档后重建。

Agent SHALL 在 `phase4-figma.md` 记录的输出位置中保存 `rootInstanceId`，供后续同步使用。只改了个别界面或簇时，Agent SHALL 传入对应的 `scope`。

同步返回非空 `conflicts` 时，Agent SHALL 把每条冲突（路径、Figma 现值、markdown 新值）逐条交给用户裁决，SHALL NOT 自行重跑或改用 create 模式绕过。用户选择以 markdown 为准时，Agent SHALL 提示用户在 Figma 中手动改回，或删除该节点后再同步。

返回 `V2_NOT_STAMPED` 时，Agent SHALL 告知用户该文档需要先认领，SHALL NOT 改用 create 模式覆盖。

#### Scenario: 用户修订 markdown 后要求更新 Figma
- **WHEN** 文档此前已渲染，用户修改了两条规则并要求同步
- **THEN** Agent SHALL 带 `rootId` 调用（可先用 `dryRun` 预览），并汇报 `changes`、`conflicts`、`preserved`

#### Scenario: 同步出现冲突
- **WHEN** 同步返回 1 条 kind 为 `text` 的冲突
- **THEN** Agent SHALL 向用户展示该条的 Figma 现值与 markdown 新值，并等待用户决定
