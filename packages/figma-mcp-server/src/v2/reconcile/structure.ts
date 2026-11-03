/**
 * 结构档案：两份文档长得不一样（`1:14` 整份克隆 vs 四部件拼装），
 * 但同步的语义必须一样。
 *
 * 差异被收在这里，而不是散成 `if (structure === 'parts')`：
 *
 *   | 事实 | legacy | parts |
 *   |---|---|---|
 *   | 配图条目形状 | GROUP 包占位矩形 | 单层矩形 |
 *   | 新节点的原型来源 | 从目标文件的 `1:14` 克隆 | 用模板包重渲一份临时文档 |
 *
 * 其余（序列对齐、手改判定、tombstone、外来节点、锁与幂等）全部复用同一套
 * 实现——那部分占 reconcile 的大头，复制一份必然漂移。
 *
 * Spec: openspec/changes/parts-doc-reconcile-sync (D1)
 */

import type { DocStamp } from './stamp.js';

export type StructureId = 'legacy' | 'parts';

export interface StructureProfile {
  id: StructureId;
  /**
   * 配图条目节点内部还套着一层占位矩形（`group`），还是本身就是那层矩形（`rect`）。
   * 填图与「描述文字改过没有」的判定都要按这个分叉。
   */
  figureSlot: 'group' | 'rect';
  /** 同步需要新节点时，原型从哪条管线来。 */
  scratch: 'legacy' | 'parts';
}

export const LEGACY_PROFILE: StructureProfile = {
  id: 'legacy',
  figureSlot: 'group',
  scratch: 'legacy'
};

export const PARTS_PROFILE: StructureProfile = {
  id: 'parts',
  figureSlot: 'rect',
  scratch: 'parts'
};

export function profileFor(stamp: DocStamp): StructureProfile {
  if (stamp.parts?.structure === 'parts' || stamp.structure === 'parts') return PARTS_PROFILE;
  return LEGACY_PROFILE;
}

/**
 * 配图槽的实际形态：**先看节点类型**，类型判断不了才用结构档案兜底。
 *
 * 真机（2026-11-03）：parts 档案一律是 `rect`，于是 named-group 模板的 `配图`
 * GROUP 被当成矩形写 `fills` → `TypeError: object is not extensible`，
 * 同步与退化两条路都死在同一处（create 正常，因为它按运行时结构判）。
 */
export function figureSlotShape(
  nodeType: string | undefined,
  profile: StructureProfile
): 'group' | 'rect' {
  if (nodeType === 'RECTANGLE') return 'rect';
  if (nodeType === 'GROUP' || nodeType === 'FRAME') return 'group';
  return profile.figureSlot;
}
