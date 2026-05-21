# Figma MCP 插件已知陷阱与硬规则

> 本文从原 `game-interaction-doc` skill v5 抢救出来。skill 已重组为 `game-interaction-sop`，所有 Figma MCP 调用细节按"一句话主义"改由本引擎封装。
> 
> 任何在引擎中调用 Figma MCP 的代码，必须遵守本文规则。违反任何一条都会导致**模板坐标爆炸**或**用户全局 undo 栈污染**等不可逆问题。

---

## 陷阱 1：GROUP 子节点的坐标语义错误（坐标爆炸 root cause）

### 现象

`move_node(node, x, y)` 在以下两种情况下，Figma 会把 `x`/`y` **解释为 GROUP-local 坐标**（而不是绝对坐标），即便 `get_node_info` 报告的 `absoluteBoundingBox` 是绝对坐标：

- node 的 parent 是 GROUP
- `clone_node` 时给 `x`/`y` 且 parent 是 GROUP

后果：GROUP 的 bbox 扩张数万 px，外层 auto-layout 重排，目标 node 被推到 X=220000 之类的位置。**每多调一次，扩张更严重**。

### 实验证据（2026-05-12）

即便目标坐标在 GROUP 现有 bbox 内部，依然爆炸。这条 bug 是**无条件**的，与目标值无关，只与 parent 的容器类型相关。

### 模板（1:14）的容器类型表

| 容器 | 类型 | 对子节点 move_node 是否安全 |
|---|---|---|
| `Comp_1`（外层） | FRAME, AUTO_LAYOUT vertical | layout 接管，`x`/`y` 无效 |
| `需求目标` | FRAME, AUTO_LAYOUT horizontal | layout 接管，`x`/`y` 无效 |
| `Comp_1`（内层）、`rec组` | **GROUP** | **❌ 永远不要 move_node** |
| `气泡` | FRAME（已修复，原模板曾是 GROUP） | ✅ 安全；⚠️ `x`/`y` 是 FRAME-local，见陷阱 2 |
| `Text` | FRAME, AUTO_LAYOUT vertical | layout 接管，`x`/`y` 无效 |
| PAGE | — | ✅ 绝对坐标 |

### 引擎硬规则

1. 任何 `move_node` 调用前，必须先用 `get_node_info` 读 parent 类型
2. parent 是 GROUP → 抛错，禁止调用
3. parent 是 AUTO_LAYOUT FRAME → 调用前警告"layout 会忽略 x/y"
4. 任何 `clone_node` 调用前，如果带 `x`/`y`，必须先确认 parent 不是 GROUP
5. 如果未来克隆出的某份模板里 `气泡` 又变回 GROUP（旧文件 / 误操作 ungroup），引擎应在 scan 阶段检测并要求用户先 `Ctrl+Alt+G` 包成 FRAME，再继续

---

## 陷阱 2：FRAME 子节点的坐标是 FRAME-local（不是绝对）

### 现象

`move_node(nodeId, x, y)` 当 parent 是 **non-auto-layout FRAME** 时，`x`/`y` 被解释为**该 FRAME 原点相对的本地坐标**，不是绝对 PAGE 坐标。返回成功，但 `absoluteBoundingBox = parentFrame.absoluteBoundingBox + (x, y)`。

### 实验证据（2026-05-11）

把 `标号` 移到绝对 `(-44210, 1305)`，其 parent FRAME `气泡` 在 `(-44872, 1291)`，结果 `absoluteBoundingBox = (-89082, 2596)`——MCP 把 parent 原点加了两次，偏离 ~44k px。

### 引擎正确公式

```ts
const local_x = target_absolute_x - parentFrame.absoluteBoundingBox.x
const local_y = target_absolute_y - parentFrame.absoluteBoundingBox.y
move_node(child_id, local_x, local_y)
```

### 引擎硬规则

1. 任何 FRAME 子节点的 move/clone 前，必须先 `get_node_info` 读 parent 的 `absoluteBoundingBox`
2. 用绝对目标 - parent 原点，得 local 坐标，传入 MCP
3. **批量布局前必须做 single-point probe**：先移一个节点，立即 `get_node_info` 验证 `absoluteBoundingBox` 是否符合预期；若不符合，立即停止，不要继续批
4. 验证失败但已经移了多个节点 → 优先告诉用户在 Figma 手动 Ctrl+Z，不要批量 trigger_undo

---

## 陷阱 3：trigger_undo 是全局 undo，不是作用域回滚

### 现象

`trigger_undo` / `commit_undo_checkpoint` 操作的是 Figma **全局** undo 栈。`trigger_undo(times=N)` 会弹出 N 个条目——任何 N 个，包括用户在另一个窗口期间的编辑。

### 引擎硬规则

1. 任何高风险批量操作前，必须 `commit_undo_checkpoint(label="...")`
2. 批量改成"先做一个、立即验证、再做剩余"，禁止"全做完再统一验证"
3. 验证失败 → 立即 `trigger_undo(times=1)`，不要继续批
4. 已经批量做了 N 次再发现问题 → 不调 `trigger_undo(times=N)`，改为告诉用户手动撤销特定节点

---

## 模板特有规则：角色标签 TEXT 数组

模板内每个"小标题"块下方有一个横向 auto-layout FRAME（命名形如 `Frame 427319720`），包含 **7 个独立 TEXT 节点**，每个对应一个角色，预染色 + 预字体（`Noto Sans SC Bold`）：

| FRAME 内顺序 | 字符 | 颜色 |
|---|---|---|
| 1 | `@GUI` | `#FF9154` |
| 2 | `@程序` | `#3ADCFF` |
| 3 | `@拼接` | `#FFEF60` |
| 4 | `@动效` | `#E121FF` |
| 5 | `@美术` | `#FF487C` |
| 6 | `@策划` | `#48FF70` |
| 7 | `@音频` | `#9E7BFF` |

### 引擎填充规则

- **保留** Markdown 命中的角色 TEXT
- **删除**未命中的 TEXT（`delete_multiple_nodes` 单批）
- 横向 auto-layout 自动收拢空隙
- ❌ 禁止改字符
- ❌ 禁止改填充色
- ❌ 禁止 `set_text_range_colors`
- ❌ 禁止重建 FRAME 结构

---

## 模板特有规则：主图与气泡的位置

气泡 (`气泡` FRAME) 与 `主图占位` / `rec组` 在模板中**完全重合**（1920×1080）。

`标号/N` 的 parent 是 `气泡` FRAME，所以使用 FRAME-local 坐标：

```
local_x = bubble 在 1920×1080 主图内的 X 偏移   // 0..1920
local_y = bubble 在 1920×1080 主图内的 Y 偏移   // 0..1080
```

**不要**额外加 `主图占位.x/y`——气泡 FRAME 已经在那个位置上。

---

## 模板特有规则：默认 8 气泡布局（无设计稿时使用）

用户没有提供精确气泡坐标时，使用以下相对主图左上角的网格，匹配典型 PC 游戏大厅布局：

| 气泡 | 相对 (x, y) | 备注 |
|---|---|---|
| 1 | (960, 60) | 顶部居中 |
| 2 | (960, 180) | 1 下方 |
| 3 | (1700, 280) | 右上 |
| 4–6 | (480, 600), (1200, 600), (1500, 600) | 中部一行 |
| 7 | (480, 800) | 中下左 |
| 8 | (480, 940) | 底左 |

实际章节内 ### 数量 ≠ 8 时，按相对密度等比缩放或重新设计网格。

---

## 模板特有规则：字体

所有可见 TEXT 节点字体固定为 `Noto Sans SC`：

- 加粗：`Noto Sans SC Bold`（需求标题、`#Name`、编号标题、小标题、表头、角色标签、气泡数字）
- 常规：`Noto Sans SC Regular`（正文说明、表格内容）

❌ 不要出现 Microsoft YaHei / Oswald / Onest / Inter / HYQiHei / Noto Serif SC 等其他字体。

---

## 从实盘渲染（等级系统，2026-05-13）必修 bug 清单

v0.1 引擎在真实 Figma 跑第一遍 + 第二遍时暴露的 render.ts 级别缺陷。**这些不是 skill / Markdown 的问题**，是引擎代码本身遗漏的渲染规则。

**状态表（2026-05-13 晚已写回 `src/v2/render.ts`）**：

| # | 描述 | 状态 | 修复位置 |
|---|---|---|---|
| 1 | 克隆说明块后 `Number` TEXT 未更新 | ✅ FIXED | `fillCluster` 内按 1-based idx 直接 setTextContent |
| 2 | `#Title_Main` 被前缀 `N.` 污染 | ✅ FIXED | `stripIndexPrefix()` + `INDEX_PREFIX_RE` |
| 3 | 配图占位单向处理（缺图未补）| ✅ FIXED | `fillCluster` 三分支双向判定 + `findSeedImageGroup` 跨块兜底 |
| 4 | 配图正则不兼容 `- / · / • / *` 前缀 | ✅ FIXED | `IMAGE_BULLET_RE` + `isImageBullet()` |
| 5 | 气泡 FRAME 本体被 move 触发陷阱 1 爆炸 | ✅ FIXED | 仅移动气泡内 `标号/N` 子节点，气泡 FRAME 本身保持 1920x1080 锚定不动 |
| 9 | 模板里 `#Title` / 角色 FRAME 存在多份副本 | ✅ FIXED | `fillCluster` 里 findAll 后 keep-first + delete-rest |
| 10 | bullet 前缀混用 `-/·/•/*` | ✅ FIXED | 写入时统一规范化为 `· ` + 正文 |

**仍待修（下次小迭代，Batch 2）**：

| # | 描述 | 状态 |
|---|---|---|
| 6 | 外来原图是 COMPONENT/FRAME 时无法抄 `imageHash` | ✅ FIXED `backend.rasterizeNodeToImageFill()` 接口 + `applyAsset` figma_node 分支重写（不再 reparent） |
| 7 | `exportAsync(SCALE=2)` 连续两张图会 5 秒超时 | ✅ FIXED 默认 SCALE=1，单次导出 |
| 8 | 贴主图后 `主图占位文案` 残留 | ✅ FIXED（Batch 1 顺带） `applyAsset` 成功后 delete hint TEXT |
| 14 | 全局规范章节（如"等级数字全局展示"）不需要主图/气泡 | ✅ FIXED `InterfaceSection.isGlobalSpec` + parser 关键词判定 + renderer 跳过主图与气泡 |
| 15 | rasterize 单脚本即使 SCALE=1 也可能超 7s 桥超时 | ✅ FIXED (graceful) — adapter 探测 timeout 后抛 `FigmaExecError.isBridgeTimeout=true`; engine `applyAsset` 的 `figma_node` 分支识别到该标志即降级为 "skip"（保留主图占位，日志警告，不中断渲染）。用户后续可在 Figma 手工拖图补上。|

---

### 细节（Bug 1-4 原始笔记，保留历史）

### Bug 1：克隆"说明块"后，`序号/交互说明标记/Number` TEXT 没跟着改

**现象**：说明块2/3/4/5 都是通过 `说明块01.clone()` 生成，克隆体里 `Number` TEXT 保留了源值 "1"，导致页面上蓝色圆圈全部显示 `1 / 2 / 1 / 1 / 1`。

**根因**：render.ts 的 `renderSection` 里只处理了 `#Title_Main` 和 cluster 内部的 `小标题 / 角色 / 正文 / 配图`，**没有**遍历到"序号"装饰 GROUP 里的编号 TEXT。

**硬规则**：每次克隆出一个 `说明块` 后，必须显式把它内部 `findAll(n => n.type === 'TEXT' && n.name === 'Number')[0].characters = String(index + 1)` 的 TEXT 设为该块的 1-based 序号。如果找不到该 TEXT，警告但继续（模板可能演化）。

**修复位置**：`src/v2/render.ts` 的 `renderSection` 或 `renderInner` 循环内，就在每次 `cloneNode` 说明块后立即执行。

### Bug 2：`#Title_Main` 不要加 "N." 前缀

**现象**：我写了 `#Title_Main = "1.当前等级"`、`"2.经验条"` 等，结果与 Bug 1 修好后的蓝色编号重复（显示 `①` + `1.当前等级`）。

**根因**：模板的"序号 GROUP" **已经承担了显示编号**的职责。功能名称文本只应填纯功能名，不能再带 `N.` 前缀。

**硬规则**：渲染到 `#Title_Main` 的文本 = `cluster.title`（纯字符串），禁止在前面拼接索引。如果 IR 的 cluster.title 里意外带了 `\d+[.、．]\s*` 前缀，应该剥离后再写入。

**修复位置**：`src/v2/render.ts` 里所有 `setTextContent(title.id, ...)` 调用点。

### Bug 3：配图占位的处理必须是**双向的**

**现象**：说明块2（经验条）有 `- 配图：经验条增长 + 升级爆发 VX 分镜` 这条 bullet，但页面上**没有**配图占位矩形。说明块3/5 正常。

**根因**：模板原生的 `说明块01` 自带 2 份"配图"GROUP（对应它的 2 套小标题示例），`说明块02` 原生**不带**任何配图 GROUP。render.ts 当前逻辑是"若无配图 bullet 则删除配图 GROUP"——**单向**。当原模板不带配图、但 Markdown 里需要时，引擎没有补上。

**硬规则**：对每个说明块，读完 bullets 后按以下双向判定：

```
needsImage = some(bullet -> /^\s*[·•]*\s*配图[：:]/.test(bullet))
existingPics = findAll(n.name === '配图' && n.type === 'GROUP')

if (needsImage && existingPics.length === 0) {
  clone a '配图' GROUP from some sibling block that has one, append to this block;
}
if (!needsImage && existingPics.length > 0) {
  remove all;
}
if (needsImage && existingPics.length > 1) {
  remove all but the first;
}
```

"某个兄弟块的配图 GROUP" 作为 clone 源——不能依赖模板里固定节点 ID，因为 `说明块01` 可能已经被删过配图。实现时先扫当前 parent 下所有兄弟块找第一个有配图的，找不到则降级：克隆任意其他章节的 `配图` GROUP（全模板级搜索），再找不到报错。

**修复位置**：`src/v2/render.ts` 的 `fillCluster` 函数里"handle 配图"段。

### Bug 4（预防性）：`配图：` 前缀识别要兼容 `· 配图：` / `•配图：` / `配图:`

bullet 经过 markdown parser 后可能保留 `- `、`· `、`• ` 等前缀，判定时用正则 `/(^|\s)配图\s*[：:]/` 或先 `strip(/^[\s\-·•*]+/)` 再检查。

---


任何写入操作前：

- [ ] scan 出模板拷贝的 `气泡.type === 'FRAME'`，否则停下要求用户手动包 FRAME
- [ ] 准备好每个 `move_node` 的 parent 类型与 absBoundingBox
- [ ] 高风险批量前 `commit_undo_checkpoint`
- [ ] 第一个 mutation 后立即 verify

任何写入操作后：

- [ ] 验证外层 `Comp_1.absoluteBoundingBox.x` 没有漂移（漂移 = GROUP bbox 爆炸 = 立即停止 + 提示用户 Ctrl+Z）

---

## 不可恢复失败的处理

- 任何核心模板节点（`模板`, source `Text`, source `说明块`, source `rec组`, source `气泡`）找不到 → 停止所有 Figma 写入，报告失败
- 引擎不能区分模板源 vs 已生成输出 → 停止
- 目标拷贝缺少必需容器 → 停止
- 继续操作需要"手工创建替代右栏卡 / 替代 Text / 替代气泡 / 自建编号标题组件" → **绝对禁止**，停止

---

## 来源

本文从 `C:\Users\miaochengming\.codex\skills\_archive\game-interaction-doc.bak\SKILL.md` 抢救并整理。原 SKILL 的"Layout Safety Rules"完整章节、`trigger_undo` 警告章节、Role-tag TEXT 数组规则、Numbered Callouts 与 Default Callout positions 等技术性内容均移入本文，由引擎代码承接。
