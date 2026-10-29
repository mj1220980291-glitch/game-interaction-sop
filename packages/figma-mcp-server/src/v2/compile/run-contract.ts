/**
 * run 契约校验 —— 编译期把「簇切不出槽位段」变成一次明确失败。
 *
 * 两段：
 * - `assertSourceRuns`：写画布前看原稿。此时一个节点都还没建，失败没有清理成本。
 * - `verifyCompiledCluster`：瘦身后看产物。这一段才是真正防止「编译再把人坑一次」
 *   的地方——配图被拍平、正文被裁、孤儿职能帧都是瘦身这一步弄出来的。
 *
 * Spec: slot-run-contract「run 契约违反即硬失败」
 */

import type { FigmaBackend, NodeInfo } from '../figma-client.js';
import { CLUSTER_SLOTS } from '../template-slots.js';
import { firstCompleteRun, splitRuns, type ClusterGroupsMode } from '../template/runs.js';
import { COMPILE_CODES, compileError } from './errors.js';

const SCAN_BUDGET = 20000;

/** 原稿簇必须先切出一段可用的 run，否则这一次编译没有意义。 */
export async function assertSourceRuns(
  backend: FigmaBackend,
  clusterRootId: string,
  mode: ClusterGroupsMode
): Promise<void> {
  if (mode !== 'slot-run') return;
  const split = splitRuns(await visibleChildren(backend, clusterRootId), mode);
  if (firstCompleteRun(split.runs)) return;
  throw compileError(
    COMPILE_CODES.RUN_CONTRACT_BROKEN,
    `原稿簇 ${clusterRootId} 切不出完整 run：` +
      (split.runs.length === 0
        ? '没有 #Title 分组标题'
        : '有 #Title 但没有任何 正文/规则') +
      '。先确认分组标题与内容行已归一化，再重编'
  );
}

/**
 * 产物簇的 run 不变量。返回问题列表（空 = 通过），由调用方决定怎么报。
 *
 * 不在这里抛错，是因为调用方要把「已建的组件 id」一起写进错误信息。
 */
export async function verifyCompiledCluster(
  backend: FigmaBackend,
  clusterRootId: string,
  mode: ClusterGroupsMode
): Promise<string[]> {
  const problems: string[] = [];
  const children = await visibleChildren(backend, clusterRootId);
  const split = splitRuns(children, mode);

  if (mode === 'slot-run') {
    const keep = firstCompleteRun(split.runs);
    if (!keep) {
      problems.push(
        split.runs.length === 0
          ? '产物簇没有 #Title 分组标题'
          : '产物簇的每段 run 都没有 正文/规则'
      );
    } else {
      if (split.runs.length !== 1) {
        problems.push(`瘦身后残留 ${split.runs.length} 段 run（应只剩 1 段样式载体）`);
      }
      if (keep.extras.length > 0) {
        problems.push(`一段 run 里残留 ${keep.extras.length} 个重复职能帧 / 配图槽`);
      }
      if (keep.figure) problems.push(...figureProblems(await scan(backend, clusterRootId), keep.figure.id));
    }
  } else if (mode === 'none') {
    // 扁平模板也一样：配图槽只要存在就必须是 GROUP。
    const nodes = await scan(backend, clusterRootId);
    for (const node of nodes) {
      if (node.name !== CLUSTER_SLOTS.figure) continue;
      if (node.visible === false) continue;
      problems.push(...figureProblems(nodes, node.id));
    }
  }

  return problems;
}

/** `配图` 必须是 GROUP，且内含 1 个矩形 + 1 个占位文案 TEXT。 */
function figureProblems(nodes: ReadonlyArray<NodeInfo>, figureId: string): string[] {
  const figure = nodes.find((n) => n.id === figureId);
  if (!figure) return [`配图槽 ${figureId} 在产物里找不到`];
  if (figure.type !== 'GROUP') {
    return [`配图槽 ${figureId} 是 ${figure.type}（应为 GROUP，含 配图占位 与 配图占位文案）`];
  }
  const subtree = descendantsOf(nodes, figureId);
  const problems: string[] = [];
  if (!subtree.some((n) => n.type === 'RECTANGLE')) {
    problems.push(`配图 GROUP ${figureId} 里没有 配图占位 矩形`);
  }
  if (!subtree.some((n) => n.type === 'TEXT')) {
    problems.push(`配图 GROUP ${figureId} 里没有 配图占位文案`);
  }
  return problems;
}

async function visibleChildren(backend: FigmaBackend, rootId: string): Promise<NodeInfo[]> {
  const info = await backend.getNodeInfo(rootId);
  const ids = info.childIds ?? [];
  if (ids.length === 0) return [];
  const nodes = await backend.getNodesInfo(ids);
  return nodes.filter((n) => n.visible !== false);
}

async function scan(backend: FigmaBackend, rootId: string): Promise<NodeInfo[]> {
  if (typeof backend.scanSubtree !== 'function') return [];
  const { nodes } = await backend.scanSubtree(rootId, SCAN_BUDGET);
  return nodes;
}

function descendantsOf(nodes: ReadonlyArray<NodeInfo>, rootId: string): NodeInfo[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: NodeInfo[] = [];
  const walk = (id: string): void => {
    for (const childId of byId.get(id)?.childIds ?? []) {
      const child = byId.get(childId);
      if (!child) continue;
      out.push(child);
      walk(childId);
    }
  };
  walk(rootId);
  return out;
}
