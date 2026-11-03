## ADDED Requirements

### Requirement: 配图槽克隆后几何归一

引擎 SHALL 让每个渲染出来的 `配图` 槽（含由模板槽克隆出的第 2..N 张）满足几何不变式：

- 槽内 `配图占位` RECTANGLE 的**绝对**左上角与槽自身绝对左上角重合（±2px），高度大于 0；
- 槽内 `配图占位文案` TEXT 的高度不小于单行高，绝对位置在 RECTANGLE 下方；
- 槽自身高度等于「矩形高 + 间距 + 文案高」，且所有子节点 bbox 落在槽 bbox 内。

`GROUP` 的子节点坐标写在**组所在父级**的坐标系里（`rect.y = 0` 只代表「贴在父级顶」），因此归一 SHALL 以组原点（`group.x` / `group.y`）为基准平移子节点，SHALL NOT 把子节点坐标归零；`FRAME` 的子节点才是 0 基局部坐标。

归一 SHALL 先摆矩形、再按矩形的当前位置算文案的 `y`（文案原先在矩形上方时，反序会让组 bbox 顶部漂移，间距随之算错）。

间距与子节点布局 SHALL 以**克隆源槽**的相对几何为真值（`gap = hint.y - (rect.y + rect.h)`，缺省 16、上限 64），SHALL NOT 写死常量宽度或高度。

归一 SHALL 在同一次插件调用（exec）内完成坐标与尺寸写入，SHALL NOT 分成多次 RPC 再读回。

缺资产（占位灰板）与已填图两条分支 SHALL 走同一套归一逻辑。

校验 SHALL 用**绝对坐标**比对（`rect.absoluteBoundingBox - group.absoluteBoundingBox`），SHALL NOT 用局部坐标判定「不在组内原点」——`GROUP` 槽的局部坐标天然等于父级偏移，会把视觉正常的槽判成异常。

归一后仍不满足不变式时，渲染 SHALL 继续并在 `warnings` 中给出 `V2_W_FIGURE_SLOT_GEOMETRY`，message SHALL 含簇路径、槽 id 与实测尺寸；SHALL NOT 静默通过。

#### Scenario: 一簇三张配图全部缺资产

- **WHEN** 某簇的 markdown 写了 3 条 `配图：`，`assetMap` 未提供任何对应资产
- **THEN** 3 个 `配图` 槽 SHALL 各自满足：绝对左上角与组重合、`rect.h > 0`、`hint.h ≥ 单行高`、`group.h = rect.h + gap + hint.h`，且无子节点越出组框

#### Scenario: 槽的父级坐标不是原点

- **WHEN** 配图 GROUP 在父级里的坐标是 `(0, 814)`（模板槽落在说明块流里）
- **THEN** 归一后 `rect` SHALL 落在组的绝对左上角，SHALL NOT 被挪到父级顶端，且 SHALL NOT 产生「矩形不在组内原点」告警

#### Scenario: 缺资产与已填图混合

- **WHEN** 某簇第 1 张配图有 `figma_node` 资产、第 2、3 张没有
- **THEN** 第 1 个槽 SHALL 按图片比例填图并删除文案，第 2、3 个槽 SHALL 满足几何不变式且文案可读

#### Scenario: 几何不可归一

- **WHEN** 归一后实测组高与「矩形高 + 间距 + 文案高」不一致（例如槽内缺 `配图占位文案`）
- **THEN** 渲染 SHALL 完成，`warnings` SHALL 含 `V2_W_FIGURE_SLOT_GEOMETRY`，且 message SHALL 指出簇路径与实测数值

### Requirement: 渲染收尾 SHALL 对全部配图槽再归一一次

克隆期归一只覆盖「克隆那一刻」。填图、文案拉宽、外层 auto-layout 拉伸都可能再次把槽弄坏，因此渲染 SHALL 在全部填充完成后，对**文档内每个** `配图` 槽再执行一次几何归一与不变式校验。

- 归一 SHALL 批量完成（每章 / 每文档一次插件调用），SHALL NOT 逐槽单独往返；
- 已贴图但被压到个位数高度的槽，SHALL 恢复到不小于 100px 的最小可读高度；
- 每个不合格的槽 SHALL 产出 `V2_W_FIGURE_SLOT_GEOMETRY`，`context` 指向簇 + 序号；
- 返回体 `summary.figureSlotsNormalized` SHALL 给出「通过校验的槽数」，作为归一代码确实执行的凭据（为 0 而文档包含配图 ⇒ 跑的是旧 build / 旧进程）。

#### Scenario: 贴图后被压扁的槽被救回

- **WHEN** 一簇 3 张配图，第 1 张有资产、填图后矩形被压到 5px
- **THEN** 收尾归一 SHALL 把该矩形恢复到 ≥ 100px，槽通过校验，`figureSlotsNormalized` 计入它

#### Scenario: 旧 build 可被识别

- **WHEN** 文档含 39 个配图槽，但返回体里 `figureSlotsNormalized` 为 0 或字段缺失
- **THEN** 验收方 SHALL 判定所跑引擎不是本次构建，而非几何已修好

### Requirement: 章节高度 SHALL 由内容决定，不被相邻栏目拉长

多部件文档的章节根是横向自动布局。渲染 SHALL 在收尾时把章节根接回 HUG（`counterAxisAlignItems = MIN`、纵向 HUG），并把章节内的自动布局栏目设为 HUG 纵向尺寸，使「高的一栏」不能把「矮的一栏」拉成整章高。

**同步（reconcile）路径 SHALL 在全部写入之后、写文档标记之前，对每个章节执行同一次复位**（不只是检测到超限的章节）。

引擎 SHALL NOT 对自动布局章节执行「两列底边对齐」式的左列拉伸（`resizeNode(left, w, taller)`）——那会把 HUG 改成固定高，且同步会把它当既成事实越滚越大。

#### Scenario: 左列只有一张主图

- **WHEN** 章节右列（说明栏）内容高 10873，左列只有一张 1920×1080 主图
- **THEN** 左列高度 SHALL 等于其内容高（标题 + 主图），SHALL NOT 等于章节高度

#### Scenario: create 后连续同步不放大高度

- **WHEN** 先用 create 渲染一份文档，再对同一份 markdown 连跑两次 reconcile
- **THEN** 四章的左列 SHALL 始终 `layoutSizingVertical = HUG` 且高度等于「标题高 + 主图高」，SHALL NOT 变成 `FIXED` 或等于章节高

#### Scenario: 同步复位的位置

- **WHEN** 同步过程中填充了正文并重摆了标号
- **THEN** 章节复位 SHALL 发生在这些写入之后，复位后章节高度 SHALL 等于内容高

### Requirement: 渲染返回体 SHALL 给出配图槽的健康计数

`summary` SHALL 含：

- `figureSlotsNormalized`：通过几何校验的槽数；
- `figureSlotsUnhealthy`：归一后仍不合格（含找不到 `配图占位`）的槽数，验收时应为 0；
- `chaptersNormalized`：收尾复位的章节数。

三者 SHALL 从 parts 渲染结果透传到 create 路径的返回体，SHALL NOT 因为白名单重组成新对象而丢失。

#### Scenario: 验收一眼判断

- **WHEN** 文档有 39 个配图槽且几何全部合格
- **THEN** 返回体 SHALL 给出 `figureSlotsNormalized: 39`、`figureSlotsUnhealthy: 0`、`chaptersNormalized: 4`

