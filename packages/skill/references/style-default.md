# 默认文风索引（Base Styles）

skill 自带 3 份基础文风，覆盖主流写作风格，随 skill 分发，零配置即可用。

| key | 文件 | 适用场景 | 关键差异 |
|---|---|---|---|
| `regular` | `style-base-regular.md` | 大多数需求的默认写法 | 3-6 bullet / 簇；只在动效 / 新资源 / 关键逻辑处 at 职能 |
| `tri-section` | `style-base-tri-section.md` | 组件状态复杂、动效密集的需求 | 簇内固定三段 `#### 界面信息 / 状态 / 动效`；状态用描述文本 |
| `detailed` | `style-base-detailed.md` | 多方协作、职责边界敏感的需求 | 5-10 bullet / 簇；每个相关职能一条独立 `- @职能：`，角色全标 |

## 选择约定

- `.interaction-sop/style.config.json` 记录当前默认 base key（见 `style-mod-schema.md`）
- 项目里 `style_own.md` / `style.md` 存在时，它们优先于 base
- base 文件本身**只读**，任何 Phase 都不改写 base 文件；用户调整某份 base 后请走 Phase 5 沉淀为 `style_own.md`

## 新手引导（第一次使用）

见 `style-mod-schema.md` 的「文件选择顺序」与 `phases/phase1-analysis.md` 的「首次使用引导」。
