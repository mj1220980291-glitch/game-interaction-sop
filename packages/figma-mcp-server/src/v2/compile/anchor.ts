/**
 * 锚点 — 部件内部各槽位怎么被认出来。
 *
 * 优先级（契约 D3 / 编译 D4）：
 *   1. plugin data（`gisop` 命名空间）——首选，不动图层名、不动外观
 *   2. 约定图层名——降级一档
 *   3. 不可见零高度 FRAME（`#anchor:<role>`）——最后兜底
 *
 * plugin data 不跨文件传递、也不保证在所有实例上下文里可读，所以降级链
 * 必须存在，而不是"打上就完事"。
 *
 * 只有降级项写进 `template.json` 的 `anchors`：用缺省命名的项目不写，
 * 否则配置里全是噪声，也违反「能克隆解决的绝不进配置」。
 *
 * Spec: openspec/changes/template-compile-to-library (D4)
 */

import type { FigmaBackend } from '../figma-client.js';
import type { AnchorSpec } from '../template/schema.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';

/** 不可见锚点的命名前缀。 */
export const ANCHOR_NAME_PREFIX = '#anchor:';

export interface RoleAnchor {
  /** 槽位名，与契约里的 role 一致（`clusterTitle` / `figure` / `badgeSlot`…）。 */
  role: string;
  nodeId: string;
  /** 该节点现有图层名，名字降级时要用。 */
  layerName?: string;
}

export interface AnchorOutcome {
  /** 成功打上 plugin data 的槽位。 */
  applied: RoleAnchor[];
  /** 只含降级项，可直接落进 `template.json`。 */
  anchors: Record<string, AnchorSpec>;
  gaps: CompileGap[];
}

/**
 * 首选路径：给槽位打 plugin data。
 *
 * 后端不支持时**不静默**：返回缺口并把槽位交给调用方走名字降级。
 */
export async function applyPluginDataAnchors(input: {
  backend: FigmaBackend;
  entries: RoleAnchor[];
}): Promise<AnchorOutcome> {
  const applied: RoleAnchor[] = [];
  const anchors: Record<string, AnchorSpec> = {};
  const gaps: CompileGap[] = [];

  if (input.entries.length === 0) return { applied, anchors, gaps };

  if (typeof input.backend.setPluginData !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 setPluginData——锚点只能降级为图层名'
    );
  }

  await input.backend.setPluginData(
    input.entries.map((e) => ({ nodeId: e.nodeId, key: `role:${e.role}`, value: e.role }))
  );
  applied.push(...input.entries);

  return { applied, anchors, gaps };
}

/** 名字降级：`anchors[role] = { kind: 'name', value: 图层名 }`。 */
export function nameAnchorSpec(layerName: string): AnchorSpec {
  return { kind: 'name', value: layerName };
}

/** 不可见 FRAME 降级：顺带在画布上补一个 `#anchor:<role>`。 */
export async function createInvisibleAnchorSpec(input: {
  backend: FigmaBackend;
  parentId: string;
  role: string;
}): Promise<{ spec: AnchorSpec; nodeId: string }> {
  if (typeof input.backend.createInvisibleAnchor !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 createInvisibleAnchor——无法补不可见锚点'
    );
  }
  const node = await input.backend.createInvisibleAnchor({
    parentId: input.parentId,
    role: input.role
  });
  return { spec: { kind: 'invisible-frame', value: `${ANCHOR_NAME_PREFIX}${input.role}` }, nodeId: node.id };
}

/**
 * 汇总：只保留降级项。plugin data 打上的槽位不写配置。
 */
export function mergeAnchorSpecs(
  degraded: Record<string, AnchorSpec>,
  applied: RoleAnchor[]
): Record<string, AnchorSpec> {
  const out: Record<string, AnchorSpec> = {};
  for (const [role, spec] of Object.entries(degraded)) {
    const viaPluginData = applied.some((a) => a.role === role);
    if (!viaPluginData) out[role] = spec;
  }
  return out;
}
