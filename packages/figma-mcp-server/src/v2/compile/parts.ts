/**
 * 部件生成 — 把 `_staging` 页上人工粘过来的四块，克隆成库文件里的 4 个组件。
 *
 * 为什么先粘再编译：插件是文件作用域的，跨文件既读不到节点也拷不了节点，
 * `importComponentByKeyAsync` 又只认已发布组件，而多数项目母版是普通
 * GROUP / FRAME（`798` 的 `Group 2360` / 隐藏 `Frame 1244`）——没有 key。
 * 所以「把东西搬进库文件」这一步由人做一次，插件从粘贴之后接管。
 *
 * `_staging` 上的原始副本一律保留（回滚点），最终组件是它的克隆。
 *
 * Spec: openspec/changes/template-compile-to-library (D1 / D2 / D8)
 */

import type { FigmaBackend, NodeInfo } from '../figma-client.js';
import { COMPILE_CODES, compileError, type CompileGap } from './errors.js';

export type PartName = 'top' | 'chapter' | 'cluster' | 'footer';

/** 渲染顺序 = 发布顺序 = 报告顺序。 */
export const PART_ORDER: readonly PartName[] = ['top', 'chapter', 'cluster', 'footer'];

export const PART_LABELS: Record<PartName, string> = {
  top: '顶部',
  chapter: '章节',
  cluster: '簇',
  footer: '结尾'
};

/** 库里的组件命名：`<项目> / 顶部`。 */
export function partComponentName(project: string, part: PartName): string {
  return `${project} / ${PART_LABELS[part]}`;
}

/**
 * Figma 把名字以 `_` 或 `.` 开头的组件归入「Hidden」，发布时静默跳过
 * （真机实测）。所以命名红线必须在写画布之前就拦住。
 */
export function isPublishableName(name: string): boolean {
  return !/^[_.]/.test(name);
}

/**
 * 配置文件名要能落到磁盘：项目名会变成 `~/.game-interaction-sop/templates/<项目名>.json`，
 * 所以不能含 Windows 非法字符（`1:14` 这种写法会直接写不出来）。
 */
export function isFileSafeName(name: string): boolean {
  return name.length > 0 && !/[:/\\*?"<>|]/.test(name);
}

export interface BuildPartsInput {
  project: string;
  /**
   * `_staging` 页上的节点 id；`footer` 可缺省。
   *
   * `chapterTitle` 是「章节标题」那一块：部分项目（蛋仔）的标题是章节组之外的
   * 独立块，不并进章节产物就没有章节名。
   */
  staged: Partial<Record<PartName, string>> & {
    chapterTitle?: string;
    topBanner?: string;
    topIntro?: string;
  };
  /** 库文件里最终组件落脚的页面 id。 */
  pageId: string;
  backend: FigmaBackend;
  /** `-v2` / `-v3`… 追加在组件名后，重编不覆盖旧组件（D8）。 */
  versionSuffix?: string;
}

export interface PartStep {
  part: PartName;
  stagedNodeId: string;
  name: string;
}

export interface BuildPartsPlan {
  steps: PartStep[];
  gaps: CompileGap[];
}

export interface BuiltPart {
  part: PartName;
  componentId: string;
  name: string;
}

export interface BuildPartsResult {
  built: BuiltPart[];
  gaps: CompileGap[];
}

/**
 * 干跑：算出要建哪几个组件、叫什么。不碰画布。
 *
 * 缺 `footer` 是正常情况（契约里可选）；缺其余任何一个部件都拒绝——
 * 少了块拼出来的文档就是残的。
 */
export function planParts(input: Pick<BuildPartsInput, 'project' | 'staged' | 'versionSuffix'>): BuildPartsPlan {
  const steps: PartStep[] = [];
  const gaps: CompileGap[] = [];

  for (const part of PART_ORDER) {
    const stagedNodeId = input.staged[part];
    if (!stagedNodeId) {
      if (part === 'footer') {
        gaps.push({
          what: '没有结尾块',
          impact: '渲染不追加结尾节点（契约允许）',
          fix: '无'
        });
        continue;
      }
      throw compileError(
        COMPILE_CODES.STAGED_PART_MISSING,
        `_staging 页上缺「${PART_LABELS[part]}」部件（${part}）——请把项目模板里对应的母版整块粘过来`
      );
    }
    if (!isFileSafeName(input.project)) {
      throw compileError(
        COMPILE_CODES.UNPUBLISHABLE_NAME,
        `项目名 "${input.project}" 含文件系统保留字符（: / \\ * ? " < > |），` +
          '没法写成 template.json 的文件名。换成 官方1.14 这类写法'
      );
    }
    const base = partComponentName(input.project, part);
    const name = input.versionSuffix ? `${base}${input.versionSuffix}` : base;
    if (!isPublishableName(name)) {
      throw compileError(
        COMPILE_CODES.UNPUBLISHABLE_NAME,
        `组件名 "${name}" 以 _ 或 . 开头，Figma 会把它归入「不发布」。请改项目名或去掉前缀`
      );
    }
    steps.push({ part, stagedNodeId, name });
  }

  return { steps, gaps };
}

function requireBackend(backend: FigmaBackend, method: keyof FigmaBackend): void {
  if (typeof backend[method] !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      `当前 Figma 后端不支持 ${String(method)}——编译需要库模式后端`
    );
  }
}

/**
 * 实跑：克隆 → （必要时 detach）→ 变组件 → 打 `part` 锚点。
 *
 * 克隆而不是搬运：`_staging` 上的原件是回滚点，`detachInstance` 不可逆。
 */
export async function buildParts(input: BuildPartsInput): Promise<BuildPartsResult> {
  const { backend, pageId } = input;
  const plan = planParts(input);

  requireBackend(backend, 'cloneNode');
  requireBackend(backend, 'createComponentFromNode');

  const built: BuiltPart[] = [];
  for (const step of plan.steps) {
    // 章节 / 簇优先走「克隆即掏空」：整块克隆 7000+ 节点再分多次 RPC 删，
    // 插件会被占住导致连接超时（真机实测）。章节更进一步：直接造壳，
    // 只搬图区，说明栏用同属性空框（单次调用降到 1 秒级）。
    const slimmable = step.part === 'chapter' || step.part === 'cluster';
    let node: NodeInfo =
      step.part === 'top' && backend.buildTopShell && (input.staged.topBanner || input.staged.topIntro)
        ? await backend.buildTopShell({
            sourceId: step.stagedNodeId,
            parentId: pageId,
            ...(input.staged.topBanner ? { bannerSourceId: input.staged.topBanner } : {}),
            ...(input.staged.topIntro ? { introSourceId: input.staged.topIntro } : {})
          })
        : step.part === 'chapter' && backend.buildChapterShell
        ? await backend.buildChapterShell({
            sourceId: step.stagedNodeId,
            parentId: pageId,
            ...(input.staged.chapterTitle ? { titleSourceId: input.staged.chapterTitle } : {})
          })
        : slimmable && backend.cloneSlimPart
          ? await backend.cloneSlimPart({
              sourceId: step.stagedNodeId,
              parentId: pageId,
              part: step.part as 'chapter' | 'cluster'
            })
          : await backend.cloneNode({
              sourceId: step.stagedNodeId,
              parentId: pageId
            });
    // 粘进来的若是实例，结构无法编辑，先拆一层（嵌套零件由 adopt 步骤继续处理）。
    if (node.type === 'INSTANCE') {
      requireBackend(backend, 'detachInstance');
      node = await backend.detachInstance!(node.id);
    }
    const comp = await backend.createComponentFromNode!({ nodeId: node.id, name: step.name });
    // 簇母版在多数项目里是隐藏的「草稿面板」，克隆后必须显式可见，
    // 否则渲染出来的每一簇都是隐形的。
    if (backend.setNodeVisible) {
      await backend.setNodeVisible(comp.id, true);
    }
    if (backend.setPluginData) {
      await backend.setPluginData([
        { nodeId: comp.id, key: 'part', value: step.part },
        { nodeId: comp.id, key: 'project', value: input.project }
      ]);
    } else {
      plan.gaps.push({
        what: `部件「${step.name}」没打上 plugin data 锚点`,
        impact: '渲染期只能按图层名 / 位置找部件',
        fix: '换支持 setPluginData 的后端，或补降级锚点'
      });
    }
    built.push({ part: step.part, componentId: comp.id, name: step.name });
  }

  return { built, gaps: plan.gaps };
}
