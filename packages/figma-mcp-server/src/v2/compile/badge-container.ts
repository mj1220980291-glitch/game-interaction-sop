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
