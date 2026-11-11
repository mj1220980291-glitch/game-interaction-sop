## 上下文

分享对象是**没跑过这套 SOP 的设计团队**。他们的第一次接触顺序固定为：

```
拿仓库 → 装依赖/编译 → 配 MCP → 开插件 → 跑 demo → 自己写第一篇
```

过去两周踩的坑全部落在这条链上，而不是渲染算法里：

| 环节 | 曾踩的坑 | 现在状态 |
|---|---|---|
| 装依赖 | 机器 PATH 无 node/npm | 文档给绝对路径（`AGENTS.md` 已有约束） |
| 配 MCP | 输出 `command: "node"` → 宿主 `spawn ENOENT` | **本 change 修** |
| 模板包 | 项目包被 gitignore、用户包在仓库外 → 换机器必丢 | 0.4.4 起随引擎分发基线包 |
| 模板包内容 | 只挑了官方 1.14，且缺 4 个原值；蛋仔根本没有 | **本 change 补** |
| 观感异常 | 缺底色时静默白底 | 0.4.7 起两条软告警 |
| 抖动 | 10s 连接超时连撞两次 | 0.4.8 起 3 次 + 递增退避 |

所以本 change 的目标不是加功能，是**把链路上的「静默失败」逐个变成「显式可用」**。

## 决策

### D1｜安装片段写绝对路径，不写 `node`

`process.execPath` 是唯一在「运行安装脚本的这台机器」上保证正确的路径。宿主（CodeMaker / Claude / Cursor / Cline）拉起 MCP 用的是**宿主的 PATH**，不是 shell 的 PATH，两者不一致是常态。

代价：仓库挪位置要重新生成片段。可接受——重生成只需一条命令，而「连不上」排查要一整晚。

### D2｜两套基线包都要「完整」，且必须重编而非手写

- `default.json` = 官方 1.14：补 `placeholder{fill,stroke}` / `bubbleGrid` / `docPadding` / `footerGap`
- `蛋仔派对.json` = 蛋仔：整套重编（当前机器没有该包）

为什么不能手写：`componentKey` 是发布快照的产物，手抄必错；`bubbleGrid` 是原稿标号点位，只能从源稿量。

产出流程固定：`phase=compile`（`staged.chapter` = 源稿章节）→ 人工发布 → `phase=verify` → `audit_template_pack` 体检 → 覆盖入库。

### D3｜给「库已发布」场景补一条采集路

其他团队大概率是「我们已经有组件库了，不想整轮重编」。`captureGeometryFromKeys` 目前不传 `sectionSourceId` / `sourceRootId` / `badgeSourceId`（其中 `sourceBackend` 是死参数），导致这条路径永远采不到 `sectionShell`，只能出「没有章节外壳」的残包。

修法：三个参数透传；没有原稿 id 时在 `gaps` 里写「缺原稿章节 id，章节底色/黑边采不到，请走 compile」。

### D4｜已知限制写进文档，不藏

新团队最容易把这三件事当缺陷报：

| 现象 | 真相 |
|---|---|
| 左列只有 1200 高，下面大片空白 | 设计如此（左列 HUG = 标题 + 舞台），空白是卡片底色 |
| 8 个标号按网格摆、没贴控件 | 未传 `badgeAnchors`，属输入缺失；`V2_W_BADGE_ANCHOR_DEFAULTED` 已提示 |
| 偶尔渲染失败一次，再试就好 | figma-console 重连预算 10s；0.4.8 起整轮重试 3 次、退避 3s/9s |

### D5｜许可证

`vendor/figma-console-mcp-1.23.0.tgz` 为 MIT。加 `THIRD-PARTY-NOTICE.md` 记录来源与许可证；根目录补 MIT `LICENSE`（团队内部是否改成其他协议由负责人定，这里先按 MIT 落地）。

## 风险

| 风险 | 缓解 |
|---|---|
| 基线包 key 随库发布失效 | 已有 `V2_TEMPLATE_KEY_STALE` + 文档写明重取路径 |
| 蛋仔包重编期间旧 key 失效 | 重编前先跑一次 `audit_template_pack deep:true`，确认现有 key 仍可 import |
| 「接入文档」写完没人真走过 | D6 试点：找一个没用过的人独立走一遍，卡住的地方回写文档 |

## 验证

- `node scripts/install-mcp.mjs --agent codemaker|cursor|cline|claude|codex` 输出里 `command` 是绝对路径
- 在 PATH 无 node 的机器上按片段配置，宿主能连上（真机）
- `audit_template_pack` 对两套基线包 `findings: []`（或仅可接受项），`deep:true` 四 key 全 ok
- 新同学按接入文档 30 分钟内渲染出第一篇（试点记录）
