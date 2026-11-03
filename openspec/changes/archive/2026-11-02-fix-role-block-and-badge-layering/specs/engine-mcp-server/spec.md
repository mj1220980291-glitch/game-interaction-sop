## ADDED Requirements

### Requirement: render_v2_markdown_to_figma 回显解析后的角色配置

`render_v2_markdown_to_figma` 的成功返回 SHALL 含 `resolvedRoleBlock`，用于一次调用即可对账配置是否生效：

- `mode`：`"keys"`（库引用）或 `"set"`（同文件组件集）
- `source`：配置文件绝对路径；来自 env 时 SHALL 标注来源为 `env`
- `componentSetId` / `variantPrefix` / `labelTextName`（有则给）
- `roles`：最终解析出的规范角色名数组

未配置 `roleBlock` 时 SHALL 省略该字段，SHALL NOT 返回空对象。

返回 SHALL 同时含 `enginePid`（当前回答该调用的进程 id）与 `configPath`（模板配置来源路径），用于多实例排查。

#### Scenario: 库引用模式回显

- **WHEN** 配置里 `roleBlock.variantKeys` 含 7 个角色，渲染成功
- **THEN** 返回 `resolvedRoleBlock.mode = "keys"`，`roles` 含 7 个规范名，`source` 指向 `~/.game-interaction-sop/template.json`

#### Scenario: 未配置角色

- **WHEN** 文档不含 `@职能` 条目且配置里没有 `roleBlock`
- **THEN** 返回 SHALL NOT 含 `resolvedRoleBlock` 字段，渲染正常完成

### Requirement: 角色块失败的错误码区分

渲染因角色块失败时，错误 SHALL 使用可区分的错误码，SHALL NOT 用同一句「模板未配置组件集」覆盖所有原因：

- 组件集在渲染目标文件内解析不到 → `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`
- 角色配置存在但 IR 需要的角色缺变体 → `V2_ROLE_BLOCK_UNAVAILABLE`（带 `details.missingRoles`）
- `variantKeys` 里没有任何合法角色名 → `V2_ROLE_BLOCK_UNAVAILABLE`（message 指明键名非法）

错误 SHALL 在克隆 / 实例化模板之前返回，SHALL NOT 在画布上留下节点。

#### Scenario: 缺角色不落画布

- **WHEN** IR 使用 `@动效`，变体表只有 `策划` / `程序`
- **THEN** 返回 `V2_ROLE_BLOCK_UNAVAILABLE`，`details.missingRoles = ["动效"]`，页面节点数不变

#### Scenario: 跨库组件集给出替代方案

- **WHEN** `componentSetId` 指向库文件内的组件集
- **THEN** 返回 `V2_ROLE_BLOCK_SET_NOT_IN_TARGET_FILE`，message SHALL 提到 `variantKeys`
