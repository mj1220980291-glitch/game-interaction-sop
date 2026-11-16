/**
 * 发布回填 — 把编译产出的 4 个组件 key 写进项目模板包。
 *
 * 「有 key」不等于「已发布」：本地组件一律有 key（真机实测：草稿里 61 个
 * 组件全有 key，跨文件一个都取不到）。所以这里**必须**做真实的
 * `importComponentByKeyAsync` 冒烟，而且要在非库文件里跑——同文件取自己
 * 永远成功，测不出问题。
 *
 * Spec: openspec/changes/template-compile-to-library (D6 / 10.x)
 */

import type { FigmaBackend } from '../figma-client.js';
import { describeBridgeSnapshot } from '../../server/bridgeState.js';
import {
  TEMPLATE_PACK_SCHEMA_VERSION,
  parseTemplatePack,
  type Capabilities,
  type TemplatePack
} from '../template/schema.js';
import { COMPILE_CODES, compileError } from './errors.js';
import { PART_LABELS, PART_ORDER, type PartName } from './parts.js';

export type ComponentKeys = Partial<Record<PartName, string | null>>;

/**
 * 冒烟失败的分类。
 *
 * 现场教训（2026-11-16 只读复核）：四条 `Cannot connect` 被当成「四个部件都
 * 不可用」，实际是桥级一句话。分类是为了别再让人从聚合文本里反推根因。
 */
export type VerifyErrorKind = 'no-client' | 'no-reply' | 'busy' | 'not-published' | 'other';

/** 桥级失败：再试后面的 key 只会得到同一句话，立刻停。 */
const BRIDGE_LEVEL: ReadonlySet<VerifyErrorKind> = new Set<VerifyErrorKind>([
  'no-client',
  'no-reply',
  'busy'
]);

export interface VerifyAttempt {
  part: PartName;
  key: string;
  startedAt: string;
  elapsedMs: number;
  errorKind: VerifyErrorKind;
}

export function classifyVerifyError(error: unknown): VerifyErrorKind {
  const err = error as { message?: string; code?: string } | undefined;
  const msg = String(err?.message ?? error ?? '');
  if (err?.code === 'V2_BRIDGE_NO_REPLY' || /没有回程/.test(msg)) return 'no-reply';
  if (/cannot connect|no websocket client|unable to establish connection/i.test(msg)) return 'no-client';
  if (/still busy|timed out|timeout/i.test(msg)) return 'busy';
  if (/published component|could not find/i.test(msg)) return 'not-published';
  return 'other';
}

export interface VerifyPublishedInput {
  backend: FigmaBackend;
  keys: ComponentKeys;
}

/**
 * 真 import 冒烟。返回可用的 key 表；任一非可选部件缺失或取不到即拒绝，
 * 且**不写部分 key**（半套 key 比没有更糟：渲染会拿到不完整的模板）。
 *
 * 每个部件都留 `{startedAt, elapsedMs, errorKind}`；桥级失败立即短路，未尝试
 * 的部件单独列出，避免把一次桥故障写成「四个部件都不可用」。
 */
export async function verifyPublished(
  input: VerifyPublishedInput
): Promise<Partial<Record<PartName, string>>> {
  if (typeof input.backend.importComponentByKey !== 'function') {
    throw compileError(
      COMPILE_CODES.BACKEND_UNSUPPORTED,
      '当前 Figma 后端不支持 importComponentByKey——无法验证发布状态'
    );
  }

  const missing: string[] = [];
  const transport: string[] = [];
  const attempts: VerifyAttempt[] = [];
  const ok: Partial<Record<PartName, string>> = {};

  for (const part of PART_ORDER) {
    const key = input.keys[part];
    if (!key) {
      if (part === 'footer') continue; // 契约允许没有结尾
      missing.push(`${PART_LABELS[part]}（未提供 key）`);
      continue;
    }
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    try {
      await input.backend.importComponentByKey(key);
      ok[part] = key;
      continue;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // 只有「找不到已发布组件」才算未发布；连不上文件是另一回事，
      // 否则插件没开时会误报「你还没发布」。
      const errorKind = classifyVerifyError(e);
      attempts.push({ part, key, startedAt, elapsedMs: Date.now() - startedMs, errorKind });
      if (errorKind === 'not-published') {
        missing.push(`${PART_LABELS[part]}（key ${key.slice(0, 8)}… 取不到，多半还没发布）`);
        continue;
      }
      transport.push(
        `${PART_LABELS[part]} key=${key}: ${msg}（${errorKind}，${Date.now() - startedMs}ms）`
      );
      if (BRIDGE_LEVEL.has(errorKind)) break;
    }
  }

  if (transport.length > 0) {
    const tried = new Set(attempts.map((a) => a.part));
    const skipped = PART_ORDER.filter((p) => input.keys[p] && !tried.has(p) && !ok[p]);
    const detail = attempts
      .map((a) => `${PART_LABELS[a.part]} ${a.elapsedMs}ms ${a.errorKind}`)
      .join('、');
    const err = compileError(
      COMPILE_CODES.VERIFY_UNAVAILABLE,
      `冒烟跑不起来（不能据此判定未发布或桥断连）：${transport.join('；')}` +
        (skipped.length > 0
          ? `；未尝试：${skipped.map((p) => PART_LABELS[p]).join('/')}（桥级失败已短路）`
          : '') +
        `；尝试明细：${detail}` +
        '——按具体部件 key、绑定文件与原始错误排查，不自动要求发布或重启' +
        `。${describeBridgeSnapshot()}`
    );
    throw Object.assign(err, {
      details: { stage: 'verify.smoke', attempts, skipped, bridge: describeBridgeSnapshot() }
    });
  }

  if (missing.length > 0) {
    throw compileError(
      COMPILE_CODES.NOT_PUBLISHED,
      `这些部件还不能跨文件使用：${missing.join('；')}——请在 Figma 里发布库后重试`
    );
  }

  return ok;
}

export interface BuildPackInput {
  project: string;
  source?: TemplatePack['source'];
  components: Partial<Record<PartName, string>>;
  capabilities: Capabilities;
  anchors?: TemplatePack['anchors'];
  /** `<项目根>/.interaction-sop/md-contract.md` 的相对路径。 */
  mdContract?: string;
  /** 文档底色 `#rrggbb`（模板身份，深色稿渲染时根帧用它）。 */
  docBackground?: string;
  /** 编译期实测的几何与色彩。 */
  geometry?: TemplatePack['geometry'];
}

/** 组装 `template.json`，并用既有的 `parseTemplatePack` 自检一遍。 */
export function buildTemplatePack(input: BuildPackInput): TemplatePack {
  const raw = {
    schema_version: TEMPLATE_PACK_SCHEMA_VERSION,
    project: input.project,
    ...(input.source ? { source: input.source } : {}),
    components: {
      top: input.components.top ?? null,
      chapter: input.components.chapter ?? null,
      cluster: input.components.cluster ?? null,
      footer: input.components.footer ?? null
    },
    capabilities: input.capabilities,
    anchors: input.anchors ?? {},
    ...(input.docBackground ? { docBackground: input.docBackground } : {}),
    ...(input.geometry ? { geometry: input.geometry } : {}),
    ...(input.mdContract ? { mdContract: input.mdContract } : {})
  };

  const parsed = parseTemplatePack(raw);
  if (!parsed.ok) {
    throw compileError(
      COMPILE_CODES.CAPABILITY_UNEXPRESSIBLE,
      `生成的模板包通不过契约校验：${parsed.errors?.join('；') ?? '未知原因'}`
    );
  }
  return parsed.pack;
}
