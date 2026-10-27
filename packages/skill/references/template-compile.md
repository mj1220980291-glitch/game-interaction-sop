# 模板编译 SOP（人跟着做）

把某个项目的 Figma 模板，变成我们自己库文件里的 4 个部件，并登记到项目配置里。

契约定义见 [`template-contract.md`](./template-contract.md)；本文件只讲**怎么做**。

---

## 0. 一句话

```
人粘一次 → 程序编译 → 人点发布 → 程序登记 key
```

中间那一步「点发布」省不掉：Figma 没有发布 API，只能人在 Assets 面板按。

---

## 1. 前置（一次性）

| 项 | 要求 |
|---|---|
| 库文件 | 一个专用 Figma 文件（当前：**交互SOP模板库** `jQf7zj33pzOGsGKO4d73OO`） |
| 库内页面 | `部件`（放 4 个部件）· `零件`（放收编出来的小组件）· `_staging`（人工粘贴中转） |
| 发布权限 | 库文件所在团队的编辑者；能打开 Assets → 管理库 → Publish |
| 字体 | 本机可加载 `Noto Sans SC` 的 `Regular` / `Medium` / `Bold` 三档 |
| 连接 | 源项目文件与库文件**都要**打开 Desktop Bridge（编译写库，verify 要在源文件里取件） |

---

## 2. 人工粘贴（只做一次）

把两样东西粘到库文件的 **`_staging`** 页：

1. **整个项目模板**（整块复制，不用挑）
2. **`1:14` 里的 `气泡` FRAME**（仅「散落标号」的项目需要，用来补标号容器）

粘完不要改名、不要摆位置——程序按 id 取，名字只用于核对。

> 为什么必须人工：插件是文件作用域的，跨文件既读不到节点也拷不了节点；
> 而且多数项目的章节母版是普通 GROUP，没有 key，`importComponentByKey` 也用不上。

---

## 3. 编译（程序做）

先跑 `figma_probe_template` 拿母版位置与能力，再调 `figma_compile_template`：

```jsonc
{
  "phase": "compile",
  "project": "蛋仔派对",
  "source":   { "fileKey": "<源文件>", "nodeId": "<模板根>" },
  "library":  { "fileKey": "jQf7zj33pzOGsGKO4d73OO", "pageId": "<部件页>" },
  "staged":   { "top": "<id>", "chapter": "<id>", "cluster": "<id>", "footer": "<id>" },
  "partsPageId": "<零件页>",
  "badgeContainerSourceId": "<气泡 id，可选>",
  "capabilities": { /* 探针输出，原样传 */ },
  "expectedFingerprint": "sha256:…",
  "actualFingerprint":   "sha256:…",
  "expectedMasters": { "chapter": { "name": "Group 2363", "width": 2209, "height": 6240 } },
  "write": false            // 先干跑；确认无误再 true
}
```

**先干跑（`write` 缺省 `false`）**：只出计划、进门检查结果与缺口，不写画布。

**再实跑（`write: true`）**，程序依次做：

1. 前置校验（后端能力 / 落点是页面 / 指纹一致）
2. 撤销检查点
3. 克隆 4 块 → 变组件 → 命名 `<项目> / 顶部|章节|簇|结尾` → 强制可见
4. 全树字体改写为 `Noto Sans SC`（字号 / 行距 / 字色不动）
5. 章节补一个空标号容器 `气泡`（形态取自 `1:14`）
6. 收编嵌套零件：`detach` → 挪到零件页 → 变自有组件 → 原位换自家实例；
   变体集用 `combineAsVariants` 重组；同一源组件只收编一次；**大尺寸实例判为内容、跳过**
7. 对产物重算 8 项能力（配置以产物为准，差异进 `gaps`）
8. 两页自动排版

**干跑看不写，实跑才写**。中断了不要慌：库里可能出现半成品组件，删掉重跑即可（未发布的组件可以随意删）。

---

## 4. 人工发布

```
库文件 → Assets → 管理库 → 交互SOP模板库 → Publish changes
```

4 个部件 + 全部零件都要在列表里。**名字以 `_` 或 `.` 开头的组件会被 Figma 归入 Hidden、不会被发布**，编译期已拦截这种命名。

---

## 5. 登记（程序做）

```jsonc
{
  "phase": "verify",
  "project": "蛋仔派对",
  "source":  { "fileKey": "<源文件>", "nodeId": "<模板根>" },
  "library": { "fileKey": "jQf7zj33pzOGsGKO4d73OO", "pageId": "<部件页>" },
  "components": { "top": "…", "chapter": "…", "cluster": "…", "footer": "…" },
  "capabilities": { /* 编译输出的能力，原样传 */ },
  "expectedFingerprint": "sha256:…"
}
```

`verify` 会逐个真 `import` 一遍（**必须在非库文件里**跑，同文件取自己永远成功），再把
`~/.game-interaction-sop/templates/<项目名>.json` 的内容返回在 `templateJson` 里，直接落盘即可。

之后渲染（旧路径）读取该文件即用；缺该文件时完全回落旧行为。

---

## 6. 重编纪律

- **追加，不原地改**：重编用 `-v2` / `-v3` 后缀生成新组件，新 key 覆盖配置
- **不删旧组件**：已交付文档还引用着它，删了会连带渲染失效
- 零件升级同理：新增零件 + 新部件版本

---

## 7. 排错

| 现象 | 原因 / 处理 |
|---|---|
| `V2_COMPILE_NOT_PUBLISHED` | 真的没发布，或发了但 key 变了。去 Assets 重发一次 |
| `V2_COMPILE_VERIFY_UNAVAILABLE` | 源文件没连插件——verify 要在**源项目文件**里跑，不能是库文件 |
| `V2_COMPILE_STAGED_PART_MISMATCH` | 粘错项目 / 漏粘 / 粘了张截图。按提示重粘 |
| `V2_COMPILE_UNPUBLISHABLE_NAME` | 名字以 `_` / `.` 开头（Figma 不发布），或项目名含 `: / \ * ? " < > |`（配置文件名写不出来，`1:14` 这类要写成 `官方1.14`） |
| `V2_COMPILE_SOURCE_DRIFT` | 源模板结构变了，先重跑探针 |
| 收编跳过一大堆 | 正常：大尺寸实例被视为截图类内容（阈值 600×400） |
| 重启后连不上、端口一路往上漂 | 僵尸进程占满 9223–9232，见 [`../figma-mcp-server/docs/INSTALL.md`](../../figma-mcp-server/docs/INSTALL.md) |

---

## 8. 已知债务

- **部件带着原稿内容**：编译是克隆母版，所以章节部件里仍有该项目当时的文案、截图实例与全部簇。渲染变更必须在填充前清空
- **标号摆位**未做：容器有了，但标号落点留到渲染变更
- **一项目多套模板**未支持
