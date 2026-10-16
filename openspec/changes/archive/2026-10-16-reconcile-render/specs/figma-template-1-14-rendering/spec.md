## ADDED Requirements

### Requirement: 首次渲染给引擎节点打标记

不带 `target.rootId` 的渲染（create 模式）SHALL 在填充完成后，给所有引擎生成的节点写入 `render-reconcile` 中定义的标记：doc、section、cluster（含完整的 `items` 清单）、item、slot。各容器中其余的直接子节点 SHALL 打上 `template` 槽位标记。标记 SHALL 在渲染末尾通过一次 `readStampedTree` 和一次 `stampNodes` 写入，节点与 IR 的对应按位置确定。

渲染产物与 IR 对不上的部分 SHALL 不打标记，并输出 warning `V2_W_STAMP_LAYOUT_MISMATCH`。打标记整体失败时 SHALL 保留已渲染的文档，并输出 warning `V2_W_STAMP_FAILED`。

create 模式的其余调用序列与产物 SHALL 与未引入标记前一致。返回值 SHALL 带 `mode: 'create'`。

#### Scenario: 渲染后可直接同步
- **WHEN** 用 create 模式渲染出一份文档，随即以同一份 markdown 和返回的 `rootInstanceId` 发起同步
- **THEN** 同步 SHALL 成功，`changes`、`conflicts` 均为空，且不产生任何画布写入

#### Scenario: 渲染后没有"外来节点"
- **WHEN** 用 create 模式渲染出一份文档
- **THEN** 每个说明块的每个直接子节点 SHALL 都带有标记

#### Scenario: 无 #### 且无配图文档的调用序列
- **WHEN** 渲染一份不含 `####`、不含 `配图：` 的文档
- **THEN** backend 调用序列 SHALL 等于原有预期序列末尾追加 `readStampedTree`、`stampNodes`
