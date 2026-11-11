# 引擎包内基线模板包

这里放**随引擎分发**的模板包，作为查找顺序的最后两级：

```
1  $GISOP_TEMPLATE_PACK
2  <cwd>/.interaction-sop/template.json
3  ~/.game-interaction-sop/templates/<project>.json
4  ~/.game-interaction-sop/templates/default.json
5  <engine>/assets/packs/<project>.json   ← 本目录（按项目）
6  <engine>/assets/packs/default.json     ← 本目录（默认）
```

任何一层用户/项目配置都能盖掉这里的文件。存在意义：换机器、换同事、刚装完引擎时
不至于「没有模板包 → 静默落回 legacy 1:14」。

## 现状

| 文件 | 状态 |
|---|---|
| `default.json` | 官方 1.14，可用；缺 `placeholder` / `bubbleGrid` / `docPadding` / `footerGap`（原值未留档，靠引擎默认值） |
| `蛋仔派对.json` | **未提供**，需从蛋仔组件库重编后补入 |

> **对外分享注意**：`default.json` 里的 `components.*` 是**公司内「官方 1.14」组件库**的发布 key，
> 团队外无法 import。外部团队必须按下面的流程编自己模板的包；只想看流程时可用
> `$GISOP_BUNDLED_PACKS=off` 关掉基线包，避免误以为是自己的模板。

## 怎么产出（不要手写）

```
figma_compile_template(phase=compile, staged.chapter=<源稿章节 id>)
  → 人工在 Assets 面板发布
  → figma_compile_template(phase=verify)
  → 取返回的 templateJson（含 capabilities / geometry / source.fingerprint）
  → 覆盖本目录同名文件
```

手写 key 只在「库已发布、想快速起步」时用，且必须校验过：`audit_template_pack`。

## 注意

包里的 `components.*` 是**库发布快照的 key**。库重新发布会换 key，旧包会命中
`V2_TEMPLATE_KEY_STALE`——按上面的流程重取即可，不要试图复用旧 key。
