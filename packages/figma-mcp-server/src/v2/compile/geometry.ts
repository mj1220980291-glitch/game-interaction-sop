/**
 * 编译期实测几何与色彩。
 *
 * 量的是**产物部件**（已经归一化、已经搬好块），不是源模板——源模板里可能
 * 有没被搬运的块，量了反而错。
 *
 * 全部可选：单项采不到就少采一项，不阻塞编译（几何是观感，不是正确性前提）。
 *
 * Spec: openspec/changes/template-geometry-capture (D1 / D2 / D4)
 */

import type { FigmaBackend } from '../figma-client.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CHAPTER_SLOTS, isBadgeFrame, isBadgeMaster } from '../template-slots.js';
import type { TemplateGeometry } from '../template/schema.js';
import type { CompileGap } from './errors.js';

export interface CaptureFromKeysInput {
  /** 绑在**库文件**上的后端（import 出来的临时实例量完就删）。 */
  libraryBackend: FigmaBackend;
  /** 绑在**源模板文件**上的后端，用来抄底色。 */
  sourceBackend?: FigmaBackend;
  chapterKey?: string | null;
  sourceRootId?: string;
  docBackground?: string;
}

/**
 * verify 阶段用：部件已发布，只能按 key import 出来量。
 *
 * 量完立刻删掉临时实例，库里不留垃圾。
 */
export async function captureGeometryFromKeys(input: CaptureFromKeysInput): Promise<{
  geometry: TemplateGeometry;
  gaps: CompileGap[];
}> {
  const { libraryBackend } = input;
  const gaps: CompileGap[] = [];
  const geometry: TemplateGeometry = {};

  if (input.docBackground) geometry.docBackground = input.docBackground;
  else if (input.sourceBackend?.readPaints && input.sourceRootId) {
    const [root] = await input.sourceBackend.readPaints([input.sourceRootId]);
    if (root?.fill) geometry.docBackground = root.fill;
  }

  if (!input.chapterKey || !libraryBackend.instantiateByKey || !libraryBackend.deleteNodes) {
    gaps.push({
      what: '没有章节部件 key，几何没法实测',
      impact: '渲染回落默认几何（1920×1080 网格、2209 宽度、白色底）',
      fix: '先让编译阶段通过，再跑 verify'
    });
    return { geometry, gaps };
  }

  const inst = await libraryBackend.instantiateByKey({
    componentKey: input.chapterKey,
    name: '__geometry_probe__'
  });
  try {
    const { geometry: measured, gaps: inner } = await captureGeometry({
      backend: libraryBackend,
      chapterComponentId: inst.id,
      ...(input.docBackground ? { docBackground: input.docBackground } : {})
    });
    Object.assign(geometry, measured);
    gaps.push(...inner);
  } finally {
    try {
      await libraryBackend.deleteNodes([inst.id]);
    } catch {
      /* 删不掉只是留个临时实例，不影响本次结果 */
    }
  }
  return { geometry, gaps };
}

export interface CaptureGeometryInput {
  backend: FigmaBackend;
  /** 已建好的章节组件 id。 */
  chapterComponentId: string;
  /** 源模板根节点 id（采底色用）。 */
  sourceRootId?: string;
  /** 绑在源模板文件上的后端（底色要在那个文件里读）。 */
  sourceBackend?: FigmaBackend;
  /** 调用方显式给的底色，优先于实测。 */
  docBackground?: string;
}

export async function captureGeometry(input: CaptureGeometryInput): Promise<{
  geometry: TemplateGeometry;
  gaps: CompileGap[];
}> {
  const { backend, chapterComponentId } = input;
  const geometry: TemplateGeometry = {};
  const gaps: CompileGap[] = [];

  // 源模板底色：显式传入 > 实测（在源文件里读）。
  if (input.docBackground) {
    geometry.docBackground = input.docBackground;
  } else if (input.sourceRootId) {
    const probe = input.sourceBackend ?? backend;
    if (probe.readPaints) {
      const [root] = await probe.readPaints([input.sourceRootId]);
      if (root?.fill) geometry.docBackground = root.fill;
    }
  }

  const chapter = await backend.getNodeInfo(chapterComponentId);
  const chapterWidth = chapter.absoluteBoundingBox?.width;
  if (chapterWidth && chapterWidth > 0) geometry.chapterWidth = Math.round(chapterWidth);

  const { nodes } = await backend.scanSubtree(chapterComponentId, 20000);
  const main = nodes.find((n) => n.name === CHAPTER_SLOTS.mainImage);
  const mainBox = main?.absoluteBoundingBox;
  if (mainBox && mainBox.width > 0 && mainBox.height > 0) {
    geometry.mainImage = { width: Math.round(mainBox.width), height: Math.round(mainBox.height) };
  } else {
    gaps.push({
      what: '章节部件里没有主图占位尺寸',
      impact: '标号按 1920×1080 归一化，主图不是这个比例时会偏',
      fix: '检查章节部件的「主图占位」是否被复制过来'
    });
  }

  // 占位填充 / 描边。
  if (main && backend.readPaints) {
    const [paint] = await backend.readPaints([main.id]);
    if (paint?.fill) {
      geometry.placeholder = { fill: paint.fill, stroke: paint.stroke ?? paint.fill };
    }
  }

  // 标号网格与母版尺寸：比例存储，模板换尺寸时自动缩放。
  const bubble = nodes.find((n) => n.name === CHAPTER_SLOTS.badgeContainer);
  if (bubble && mainBox) {
    const { nodes: inside } = await backend.scanSubtree(bubble.id, 4000);
    const master =
      inside.find((n) => isBadgeMaster(n.name)) ??
      inside.find((n) => isBadgeFrame(n.name) && /母版/.test(n.name));
    const badges = inside
      .filter((n) => n.type === 'FRAME' && isBadgeFrame(n.name) && !isBadgeMaster(n.name))
      .filter((n) => n.absoluteBoundingBox)
      .sort((a, b) => badgeOrdinal(a.name) - badgeOrdinal(b.name));

    if (badges.length > 0) {
      geometry.bubbleGrid = badges.map((b) => {
        const box = b.absoluteBoundingBox!;
        return {
          x: round4((box.x - mainBox.x) / mainBox.width),
          y: round4((box.y - mainBox.y) / mainBox.height)
        };
      });
    } else {
      gaps.push({
        what: '章节部件的标号容器里没有可用的 `标号/N`',
        impact: '标号按默认 8 网格摆放',
        fix: '编译时会按源模板的母版补一个；补不上就靠默认网格'
      });
    }

    const masterBox = master?.absoluteBoundingBox;
    if (masterBox) {
      geometry.badgeSize = {
        width: Math.round(masterBox.width),
        height: Math.round(masterBox.height)
      };
    }
  }

  return { geometry, gaps };
}

function badgeOrdinal(name: string): number {
  const m = /(\d+)\s*$/.exec(name);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// --- sidecar ---------------------------------------------------------------

/**
 * 编译与 verify 是两次调用：几何在 compile 阶段量（那时还看得到粘进来的原稿），
 * 但 pack 是 verify 阶段写的。中间用一份 sidecar 传值。
 */
function sidecarPath(project: string): string {
  const safe = project.replace(/[\\/:*?"<>|]/g, '_');
  return join(homedir(), '.game-interaction-sop', 'templates', `${safe}.geometry.json`);
}

export function writeGeometrySidecar(project: string, geometry: TemplateGeometry): void {
  if (Object.keys(geometry).length === 0) return;
  try {
    const path = sidecarPath(project);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(geometry, null, 2), 'utf8');
  } catch (e) {
    process.stderr.write(`[compile] geometry sidecar write failed: ${(e as Error).message}\n`);
  }
}

export function readGeometrySidecar(project: string): TemplateGeometry | undefined {
  try {
    const raw = readFileSync(sidecarPath(project), 'utf8');
    const parsed = JSON.parse(raw) as TemplateGeometry;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}
