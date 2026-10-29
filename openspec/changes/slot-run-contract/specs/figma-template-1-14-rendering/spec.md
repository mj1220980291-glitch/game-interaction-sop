## ADDED Requirements

### Requirement: 职能标签帧整簇唯一

渲染完成后，一个说明块内 SHALL 只存在 1 个职能标签 FRAME（名字命中职能帧前缀），且其中 SHALL 只保留本簇 `roles[]` 声明的角色 TEXT。

模板自带多个职能帧（每段 run 各 1 个）时，引擎 SHALL 只克隆第一个，其余 SHALL 随原型 run 一起删除；编译产物残留的未命名职能帧 SHALL 同样被删除。

#### Scenario: 两段 run 只留一个职能帧

- **WHEN** 模板簇带 2 段 run，每段各含 1 个职能帧
- **THEN** 渲染后该说明块内 SHALL 只有 1 个职能帧（位于第一段），SHALL NOT 残留第二个

#### Scenario: 孤儿职能帧被清理

- **WHEN** 编译产物里残留一个名称为 `Frame 427319721` 的职能帧
- **THEN** 渲染 SHALL 删除它，产物 SHALL NOT 显示上一份文档的角色标签

### Requirement: 配图槽双形态兼容

渲染填充 SHALL 优先按 GROUP 处理配图槽，同时 SHALL 继续接受裸矩形形态（未重编的旧模板包）。

判定 SHALL 依据节点类型与名字，SHALL NOT 依据「第几个配图槽」猜序号；是否已放图 SHALL 依据填充类型（有 IMAGE 填充的槽 MUST NOT 被判为多余）。

#### Scenario: 新包 GROUP 形态

- **WHEN** 产物配图槽是 `配图` GROUP，内含 `配图占位` 矩形与 `配图占位文案`
- **THEN** 渲染 SHALL 填充矩形、写入占位文案，SHALL NOT 报结构错误

#### Scenario: 旧包裸矩形形态

- **WHEN** 旧模板包的配图槽是名为 `配图` 的裸矩形
- **THEN** 渲染 SHALL 直接填充该矩形，SHALL NOT 因缺少 GROUP 而失败

## MODIFIED Requirements

### Requirement: 簇内子分类小标题渲染

一个 `说明块` SHALL 被视为「簇级表头 + 可重复槽位段」而非扁平正文。

模板 `1:14` 自带 2 段（2026-08-11 实测确认）：

```
说明块01
  标题(GROUP)                                    ← 簇级表头，全块唯一
    序号 → 交互说明标记 → Base(VECTOR) + Number(TEXT)
    #Title_Main(TEXT)
  #Title  Frame4273xxx  正文/规则×2  配图         ← 槽位段 1
  #Title  Frame4273xxx  正文/规则×2  配图         ← 槽位段 2
```

因此一个 `####` 子分类 SHALL 渲染为该簇说明块**内部**的一段槽位，而不是一个
独立说明块。每簇仍然只占 1 个说明块，块数 SHALL 恒等于簇数。

槽位段的边界 SHALL 由共享规则 `src/v2/template/runs.ts` 的 `splitRuns()` 给出，渲染端
SHALL NOT 维护自己的切分实现。规则为：以每个 `#Title`（`SECTION_CHILD_NAMES.clusterSubTitle`）
为起点，延伸至下一个 `#Title` 之前；第一个 `#Title` 之前的节点属于簇级表头，引擎 SHALL
不克隆、不删除。

簇级表头 SHALL 原样保留：一个簇在主图上只对应 1 个编号气泡，其编号与主标题必须
且只能出现一次。引擎 SHALL NOT 通过「只删 `Number` TEXT」的方式去除编号——蓝色圆圈
由同级的 `Base` VECTOR 绘制，单删文字会留下空心圆。

槽位 SHALL 按「先建后删」组装：先按 `groups` 顺序克隆出全部新槽位段追加到块尾，
再整体删除模板原有的槽位段。说明块是 AUTO_LAYOUT 容器且后端只支持 append，克隆
必落块尾，唯有此顺序能得到正确的堆叠次序；它同时允许每段按需精确组装，而不是
克隆后再裁剪。

每段 SHALL 按如下规则组装：

| 元素 | 规则 |
|---|---|
| `#Title` | `title` 非 null 时克隆并写入；`title === null`（W5 的隐式首组）时不克隆，绝不留下模板占位文案 |
| 角色标签 FRAME | 仅第 1 段克隆。`@角色` 是 `###` 簇级声明，逐段重复只是噪音；块内职能帧最终 SHALL 只有 1 个 |
| `正文/规则` | 按该组可见 bullet 数精确克隆，`配图：` bullet 不占正文槽位；连续的规则 bullet 合并为一次 `batchCloneNodes` |
| `配图` | 该组每条 `配图：xxx` 各克隆 1 个，按 bullet 顺序穿插在 `正文/规则` 之间，描述写入各自的 `配图占位文案` TEXT；克隆源 SHALL 优先取 GROUP 形态的槽位 |

无 `####` 的簇（`groups` 长度 ≤ 1 且 `title === null`）SHALL 走扁平路径，模板自带的
全部 `#Title` 实例被删除；扁平路径的配图处理见「配图按 bullet 原位渲染且一簇多张」。

#### Scenario: 无 `####` 完全向后兼容

- **WHEN** 簇 IR 为 `{ groups: [{ title: null, bullets: ['a', 'b'] }] }`
- **THEN** 渲染路径 SHALL 不进入槽位分支，产物与实现前一致，且模板自带的全部 `#Title` 占位 SHALL 被删除
- **AND** 整份不含 `####` 且不含 `配图：` 的文档，其 backend 调用序列 SHALL 与本能力实现之前逐项一致

#### Scenario: 多个 `####` 渲染为同一块内的多段槽位

- **WHEN** 簇 IR 为 `{ groups: [{ title: '基础信息', bullets: ['a'] }, { title: '升级反馈', bullets: ['b'] }] }`
- **THEN** 引擎 SHALL 产出 1 个说明块，其直接子节点顺序为 `[标题, #Title="基础信息", 角色框, 正文="a", #Title="升级反馈", 正文="b"]`

#### Scenario: 簇级表头不随子分类重复

- **WHEN** 一个簇有 3 个 `####`
- **THEN** 该说明块内 `Number`、`#Title_Main`、`Base`、`交互说明标记` SHALL 各只存在 1 个

#### Scenario: 角色标签只出现在第一段

- **WHEN** 一个簇有 2 个 `####`，`@GUI @程序`
- **THEN** 该说明块内 `Frame 4273` 开头的 FRAME SHALL 只有 1 个，且其内只保留 `@GUI` 与 `@程序` 两个 TEXT

#### Scenario: 配图只落在声明它的那一段

- **WHEN** group[0].bullets = ['a']，group[1].bullets = ['b', '配图：xxx']
- **THEN** 该说明块内 SHALL 只有 1 个 `配图` GROUP，位于第 2 段，其 `配图占位文案` TEXT 写入该描述

#### Scenario: 子分类数超过模板自带槽位数

- **WHEN** 一个簇有 4 个 `####`，而模板只自带 2 段槽位
- **THEN** 引擎 SHALL 产出 4 段，顺序与文档一致

#### Scenario: 分组簇与不分组簇共存

- **WHEN** 章节内第 1 个簇有 2 个 `####`、第 2 个簇无 `####`
- **THEN** 右栏 SHALL 有 2 个说明块；第 1 块含 2 段槽位，第 2 块不含任何 `#Title`

#### Scenario: 模板自带两段但文档只有一组

- **WHEN** 编译产物保留 1 段 run，文档某簇只有 1 组正文
- **THEN** 渲染 SHALL 产出 1 段，且 SHALL NOT 残留模板自带的第二段
