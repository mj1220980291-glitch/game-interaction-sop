/**
 * 槽位段（run）—— 簇说明块的唯一边界规则。
 *
 * 一个 `说明块` 不是扁平列表，是「簇级表头 + 可重复槽位段」：
 *
 *   标题(GROUP)                                  ← 表头，全块唯一
 *   #Title  Frame4273  正文/规则×2  配图          ← run 1
 *   #Title  Frame4273  正文/规则×2  配图          ← run 2
 *
 * 这条规则以前只活在渲染端的私有函数 `splitSlotRuns` 里，编译端按名字全局裁剪，
 * 两边对同一个簇的理解不一致，`官方1.14` 因此产出过配图被拍平、正文少一条的部件。
 * 现在编译 / 渲染 / 同步三端都从这里取边界。
 *
 * Spec: openspec/changes/slot-run-contract
 */

import { CLUSTER_SLOTS, isRoleFrame } from '../template-slots.js';
import type { Capabilities } from './schema.js';

/** run 判定只吃这几个字段，不关心后端类型。 */
export interface RunNode {
  id: string;
  name: string;
  type: string;
  children?: RunNode[];
  visible?: boolean;
}

export interface SlotRun {
  /** 分组标题 `#Title`；`clusterGroups = none` 时没有。 */
  title?: RunNode;
  /** 职能标签 FRAME，每段最多 1 个。 */
  roleFrame?: RunNode;
  /** `正文/规则`，≥1 条才算完整 run。 */
  body: RunNode[];
  /** `配图` 槽（GROUP / FRAME / 裸矩形）。 */
  figure?: RunNode;
  /**
   * 一段里多出来的职能帧 / 配图槽。
   *
   * 契约允许的数量是 ≤1，多出来的只有编译瘦身需要知道——它得把这些重复成员
   * 一起删掉。渲染不读这个字段。
   */
  extras: RunNode[];
}

export interface RunSplit {
  /** 不属于任何 run 的节点：簇级表头，调用方不得克隆或删除。 */
  header: RunNode[];
  runs: SlotRun[];
}

export type ClusterGroupsMode = Capabilities['clusterGroups'];

/**
 * 按直接子节点切分 run。
 *
 * - `slot-run`：每个 `#Title` 起一段，之前的是表头。
 * - `none`：整簇一段无标题 run，表头为空。
 * - `inline-subtitle`：不产生 run，子节点全归表头（`#Title` 由调用方按前缀处理）。
 */
export function splitRuns(
  children: ReadonlyArray<RunNode>,
  mode: ClusterGroupsMode = 'slot-run'
): RunSplit {
  if (mode === 'none') {
    const run: SlotRun = { body: children.filter(isBody), extras: [] };
    const figure = children.find(isFigure);
    const roleFrame = children.find(isRoleFrameNode);
    if (figure) run.figure = figure;
    if (roleFrame) run.roleFrame = roleFrame;
    return { header: [], runs: [run] };
  }
  if (mode === 'inline-subtitle') return { header: [...children], runs: [] };

  const header: RunNode[] = [];
  const runs: SlotRun[] = [];
  let current: SlotRun | undefined;
  for (const child of children) {
    if (isGroupTitle(child)) {
      current = { title: child, body: [], extras: [] };
      runs.push(current);
      continue;
    }
    if (!current) {
      header.push(child);
      continue;
    }
    if (isBody(child)) current.body.push(child);
    else if (isRoleFrameNode(child)) {
      if (current.roleFrame) current.extras.push(child);
      else current.roleFrame = child;
    } else if (isFigure(child)) {
      if (current.figure) current.extras.push(child);
      else current.figure = child;
    }
  }
  return { header, runs };
}

/** 完整 run：至少一条正文。 */
export function isCompleteRun(run: SlotRun): boolean {
  return run.body.length >= 1;
}

/** 第一个完整 run；模板里没有一段可用时返回 undefined。 */
export function firstCompleteRun(runs: ReadonlyArray<SlotRun>): SlotRun | undefined {
  return runs.find(isCompleteRun);
}

/** 一段 run 的全部根节点 id（删掉即整段消失）。 */
export function runMemberIds(run: SlotRun): string[] {
  return [
    ...(run.title ? [run.title.id] : []),
    ...(run.roleFrame ? [run.roleFrame.id] : []),
    ...run.body.map((n) => n.id),
    ...(run.figure ? [run.figure.id] : []),
    ...run.extras.map((n) => n.id)
  ];
}

function isGroupTitle(n: RunNode): boolean {
  return n.type === 'TEXT' && n.name === CLUSTER_SLOTS.groupSlot;
}

function isBody(n: RunNode): boolean {
  return n.type === 'TEXT' && n.name === CLUSTER_SLOTS.bullet;
}

function isRoleFrameNode(n: RunNode): boolean {
  return n.type === 'FRAME' && isRoleFrame(n.name);
}

/** 配图槽：名字统一是 `配图`，类型随模板（官方 GROUP / 蛋仔裸矩形）。 */
export function isFigure(n: RunNode): boolean {
  return (
    n.name === CLUSTER_SLOTS.figure &&
    (n.type === 'GROUP' || n.type === 'FRAME' || n.type === 'RECTANGLE')
  );
}
