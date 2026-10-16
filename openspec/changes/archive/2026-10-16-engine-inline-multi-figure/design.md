## Context

说明块是 AUTO_LAYOUT FRAME，backend 只支持 append（`cloneNode` / `batchCloneNodes` 一律 `appendChild`）。模板 `说明块01` 直接子节点：

```
标题 | #Title | Frame4273 | 正文 正文 | 配图 | #Title | Frame4273 | 正文 正文 | 配图
```

现状两条路径：

- **扁平路径**（`fillBlockContent`）：保留前 N 个 `正文/规则`、不足则追加克隆；`配图` 保留第一个、写入**第一条** `配图：` 描述。由于保留的是模板原位节点，`说明块01` 中 ≥3 条 bullet 时配图实际落在第 2、3 条之间——既不是"簇末"也不是"原位"，属现存隐性 bug。
- **槽位路径**（`fillGroupSlots`）：每段 `batchCloneNodes(正文×N)` 后至多克隆 1 个 `配图`，写**该段第一条** `配图：` 描述。

## Goals / Non-Goals

**Goals:**
- 说明块（或槽位段）内 `正文/规则` 与 `配图` 的顺序 = Markdown bullet 顺序
- 每条 `配图：` 一个 GROUP，描述各自写入
- 无配图的簇调用序列不变；有配图的 `####` 段在"单图在段末"时调用序列不变

**Non-Goals:**
- 配图框尺寸 / 宽高比 / 裁剪（下一个 change）
- 增量渲染（再下一个 change）
- 贴图后隐藏「配图占位：xxx」文案

## Decisions

### D1：有配图的扁平簇改走「先建后删」原位组装
沿用 `fillGroupSlots` 已验证的策略：按 bullet 顺序向块尾追加克隆（连续规则 bullet 合并为一次 `batchCloneNodes`，每条 `配图：` 一次 `cloneNode`），再一次性删除模板原有的直接子 `正文/规则` 与 `配图`（种子经 `imageSeed.filterDeletes` 豁免）。
- 备选：在原位节点间插入——backend 无 `insertChild`，需新增 backend 能力，否决。
- 无配图的扁平簇保持原路径（保留前 N 个原位节点），零回归。

### D2：抽出共享 helper `appendBulletsInOrder`
输入 `{ parentId, bullets, protoBulletId, protoImageId, trace }`，输出 `{ textUpdates, imageGroupIds[], imageDescs[] }`。扁平原位分支与 `fillGroupSlots` 每段都调用它。对"无图"或"单图在末尾"的段，产出的调用序列与现 `fillGroupSlots` 相同（一次 batchClone + 一次 cloneNode）。

### D3：配图描述一次 scan 批量写入
组装完、删除原节点后，对说明块 `scanSubtree` 一次，按 `parentId` 找到每个新 `配图` GROUP 下的 `配图占位文案` TEXT，与正文更新合并进同一次 `setMultipleTextContents`。比现在"每张图 1 次 scan + 1 次 setTextContent"少 2N−1 次 RTT，抵消多图带来的超时风险。
- 影响：`####` 有配图段的写描述方式从逐个 `setTextContent` 变为合并批量——最终画布状态一致，调用序列不同；现有测试只断言最终状态。

### D4：原型选取
- `protoBullet`：块内第一个直接子 `正文/规则`
- `protoImage`：块内第一个直接子 `配图` GROUP，缺失时回落 `imageSeed.id`
- 两者都缺失时跳过对应克隆（与现行为一致，不新增报错）

## Risks / Trade-offs

- [有配图扁平簇的调用序列改变] → 只影响有配图的簇；画布终态与旧行为相比仅顺序修正。现有 `render-image-seed` 测试终态断言应继续通过
- [多图簇克隆次数增加，逼近 30s 超时] → D3 批量写描述；超时问题本身归后续 change
- [模板原型被删后后续段无源可克隆] → 原型在所有段组装完成后才删除（与现 `fillGroupSlots` 一致）
