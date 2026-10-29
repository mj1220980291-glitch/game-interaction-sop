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
  /**
   * `_staging` 上的原稿章节 id：用它的祖先链量「章节外框内边距」。
   * 编译产出的章节只取最里层，外层 `Comp_1` / `需求目标` 的 padding 会丢，
   * 那正是模板的黑色边距。
   */
  sectionSourceId?: string;
  /**
   * 量标号网格用的原稿节点。
   *
   * 产物里的标号已经被收口成「只留母版」，`标号/N` 的点位只有原稿还带着；
   * 主图尺寸与占位色仍然从**产物**量（产物名字已归一化，原稿可能没有统一名）。
   */
  badgeSourceId?: string;
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

  if (input.sectionSourceId) {
    const chain = await measureSectionShell(backend, input.sectionSourceId);
    if (chain.length > 0) {
      geometry.sectionShell = chain;
    } else {
      gaps.push({
        what: '章节外面没有带内边距 / 填充的外框',
        impact: '渲染时章节上下会贴边，章节卡片底色也会缺（模板本来靠外框留黑边）',
        fix: '确认 _staging 上粘的是完整模板层级（外框一起粘），或接受无留白'
      });
    }
  }

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
  // 点位只有原稿带着（产物里的 `标号/N` 已被收口成母版），所以优先看原稿。
  const badgeNodes = input.badgeSourceId
    ? (await backend.scanSubtree(input.badgeSourceId, 20000)).nodes
    : nodes;
  const bubble = badgeNodes.find((n) => n.name === CHAPTER_SLOTS.badgeContainer);
  const badgeMainBox =
    badgeNodes.find((n) => n.name === CHAPTER_SLOTS.mainImage)?.absoluteBoundingBox ?? mainBox;
  if (bubble && badgeMainBox) {
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
          x: round4((box.x - badgeMainBox.x) / badgeMainBox.width),
          y: round4((box.y - badgeMainBox.y) / badgeMainBox.height)
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

/**
 * 从原稿章节向上走到页面，收每一层外框（外 → 内）：内边距 + 纯色填充。
 *
 * 模板的黑色边距与卡片底色就是这些外框给的：`官方1.14` 是 `Comp_1`
 * pad 64 / `#000000`，`需求目标` pad 64 / `#161616`。只收「有 padding 或有
 * 填充」的层，都没有就返回空数组（模板本来就不留边）。
 */
async function measureSectionShell(
  backend: FigmaBackend,
  childId: string
): Promise<Array<{ padding: { top: number; right: number; bottom: number; left: number }; fill?: string }>> {
  const chain: Array<{
    padding: { top: number; right: number; bottom: number; left: number };
    fill?: string;
  }> = [];
  let cur = (await backend.getNodeInfo(childId)).parentId;
  while (cur) {
    const parent = await backend.getNodeInfo(cur);
    const pad = parent.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    let fill: string | undefined;
    if (backend.readPaints) {
      const [paint] = await backend.readPaints([cur]);
      fill = paint?.fill;
    }
    const hasPad = pad.top || pad.right || pad.bottom || pad.left;
    if ((hasPad || fill) && !isRootOf(parent)) {
      chain.unshift(fill ? { padding: pad, fill } : { padding: pad });
    }
    if (parent.type === 'PAGE' || !parent.parentId) break;
    cur = parent.parentId;
  }
  return chain;
}

/** 模板根节点自己的填充是文档底色，不能当成章节外框。 */
function isRootOf(node: { parentType?: string }): boolean {
  return node.parentType === 'PAGE';
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
