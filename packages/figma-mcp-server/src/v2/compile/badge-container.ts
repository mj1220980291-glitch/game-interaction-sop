/**
 * 标号容器补齐 — 散落标号（`badgeSlot=manual`）的模板，章节部件里补一个空
 * 标号容器，形态沿用官方 `1:14` 的 `气泡` FRAME。
 *
 * 为什么补：没有容器就没有坐标基准，渲染期只能靠人手标；有了容器，
 * 产物探针会把 `badgeSlot` 判成 `container`，能力差异进 gaps 而不是悄悄错。
 *
 * 为什么不自己画：容器是样式载体（尺寸 / 圆角 / 填充 / 描边），按契约
 * 「样式靠克隆继承」，形态必须来自 `1:14`，不在代码里写死数值。
 *
 * 标号的**具体摆放位置**不在本步骤计算。
 *
 * Spec: openspec/changes/template-compile-to-library (D9)
 */

import type { FigmaBackend } from '../figma-client.js';
import { BADGE_MASTER_NAME } from '../template-slots.js';
import { SECTION_CHILD_NAMES } from '../template-map.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';

/** 容器在部件里的固定图层名——渲染期按名字找。 */
export const BADGE_CONTAINER_NAME = '气泡';

export interface EnsureBadgeContainerInput {
  backend: FigmaBackend;
  /** 章节组件 id（容器挂到它下面）。 */
  chapterComponentId: string;
  /** `_staging` 上从 `1:14` 粘过来的 `气泡` 节点 id；没有则不补。 */
  containerSourceId?: string;
  /** 源模板本来就是 `container`（自带标号框）时跳过。 */
  alreadyHasContainer?: boolean;
}

export interface EnsureBadgeContainerResult {
  applied: boolean;
  containerId?: string;
  gaps: CompileGap[];
}

export async function ensureBadgeContainer(
  input: EnsureBadgeContainerInput
): Promise<EnsureBadgeContainerResult> {
  const gaps: CompileGap[] = [];

  if (input.alreadyHasContainer) {
    return { applied: false, gaps };
  }

  if (!input.containerSourceId) {
    gaps.push({
      what: '标号无容器，且没有提供 1:14 的「气泡」作为形态来源',
      impact: '产物仍是散落标号（badgeSlot=manual），图上标号需人工摆位',
      fix: '把 1:14 的「气泡」FRAME 粘到 _staging 页，编译时用 containerSourceId 传入'
    });
    return { applied: false, gaps };
  }

  if (typeof input.backend.cloneNode !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 cloneNode——无法补齐标号容器'
    );
  }

  const clone = await input.backend.cloneNode({
    sourceId: input.containerSourceId,
    parentId: input.chapterComponentId,
    name: BADGE_CONTAINER_NAME
  });

  if (input.backend.setPluginData) {
    await input.backend.setPluginData([
      { nodeId: clone.id, key: 'role', value: 'badgeSlot' }
    ]);
  }

  gaps.push({
    what: '标号容器：源模板散落标号 → 产物统一容器',
    impact: '能力值由产物探针重算为 container；标号具体摆放留后续统一解决',
    fix: '渲染变更负责按容器坐标摆位'
  });

  return { applied: true, containerId: clone.id, gaps };
}

// --- 标号母版收口 ---------------------------------------------------------

/**
 * 容器里必须恰好留一个**隐藏母版** `标号/母版`：
 *   - 源模板自带多个标号（`1:14` 的 8 个）→ 留一个改名、隐藏，其余删除
 *   - 补容器场景：`1:14` 的 `气泡` 是整棵克隆，标号随之带进来，同样收口
 *   - 一个标号都没有 → 记缺口，能力重算时自然降级为不可摆位
 *
 * 母版是样式的唯一来源（尺寸 / 圆角 / 填充 / 描边），所以必须来自克隆，
 * 不在代码里画。
 *
 * Spec: openspec/changes/engine-multi-part-template-render (D7 / template-compile)
 */
export interface EnsureBadgeMasterInput {
  backend: FigmaBackend;
  /** 章节组件 id（容器挂它下面）。 */
  chapterComponentId: string;
  /** 已知容器 id；不给则按名字 `气泡` 在章节子树里找。 */
  containerId?: string;
}

export interface EnsureBadgeMasterResult {
  masterId?: string;
  applied: boolean;
  /** 被删掉的其余标号。 */
  removed: string[];
  gaps: CompileGap[];
}

export async function ensureBadgeMaster(
  input: EnsureBadgeMasterInput
): Promise<EnsureBadgeMasterResult> {
  const { backend } = input;
  const gaps: CompileGap[] = [];

  if (typeof backend.scanSubtree !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 scanSubtree——无法定位标号容器'
    );
  }

  let containerId = input.containerId;
  if (!containerId) {
    const { nodes } = await backend.scanSubtree(input.chapterComponentId, 8000);
    containerId = nodes.find((n) => n.name === BADGE_CONTAINER_NAME)?.id;
  }
  if (!containerId) {
    gaps.push({
      what: '章节部件里没有标号容器（`气泡`）',
      impact: '图上标号无处摆放，渲染会报 V2_RENDER_BADGE_MASTER_MISSING',
      fix: '把 1:14 的「气泡」粘到 _staging 页，编译时用 badgeContainerSourceId 传入后重编'
    });
    return { applied: false, removed: [], gaps };
  }

  const container = await backend.getNodeInfo(containerId);
  const childIds = container.childIds ?? [];
  const children = childIds.length > 0 ? await backend.getNodesInfo(childIds) : [];
  const badges = children.filter((c) => c.name.startsWith(SECTION_CHILD_NAMES.bubbleNumberPrefix));
  const master = badges.find((b) => b.name === BADGE_MASTER_NAME) ?? badges[0];

  if (!master) {
    gaps.push({
      what: '标号容器里没有标号母版',
      impact: '渲染无法生成图上标号（会返回 V2_RENDER_BADGE_MASTER_MISSING）',
      fix: '把 1:14 的一个「标号/N」粘进容器，或让容器来源带上标号后重编'
    });
    return { applied: false, removed: [], gaps };
  }

  const removed = badges.filter((b) => b.id !== master.id).map((b) => b.id);
  if (removed.length > 0 && typeof backend.deleteNodes === 'function') {
    await backend.deleteNodes(removed);
  }

  let applied = false;
  if (master.name !== BADGE_MASTER_NAME) {
    if (typeof backend.renameNode !== 'function') {
      throw compileError(
        COMPILE_CODES.BACKEND_UNSUPPORTED,
        '当前 Figma 后端不支持 renameNode——无法把标号改名成母版'
      );
    }
    await backend.renameNode(master.id, BADGE_MASTER_NAME);
    applied = true;
  }

  if (typeof backend.setNodeVisible === 'function') {
    if (master.visible !== false) {
      await backend.setNodeVisible(master.id, false);
      applied = true;
    }
  } else {
    gaps.push({
      what: '后端不支持 setNodeVisible，标号母版无法隐藏',
      impact: '画布上会多出一个静止的标号',
      fix: '手工在库里隐藏该节点'
    });
  }

  const scanned = await backend.scanSubtree(master.id, 200);
  if (!scanned.nodes.some((n) => n.type === 'TEXT')) {
    gaps.push({
      what: '标号母版里没有可写编号文本',
      impact: '渲染写不进编号，标号会一直是母版的数字',
      fix: '确认母版内含编号 TEXT（`#Number`）'
    });
  }

  return { applied, masterId: master.id, removed, gaps };
}
