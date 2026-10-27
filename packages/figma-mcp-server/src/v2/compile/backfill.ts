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
import {
  TEMPLATE_PACK_SCHEMA_VERSION,
  parseTemplatePack,
  type Capabilities,
  type TemplatePack
} from '../template/schema.js';
import { COMPILE_CODES, compileError } from './errors.js';
import { PART_LABELS, PART_ORDER, type PartName } from './parts.js';

export type ComponentKeys = Partial<Record<PartName, string | null>>;

export interface VerifyPublishedInput {
  backend: FigmaBackend;
  keys: ComponentKeys;
}

/**
 * 真 import 冒烟。返回可用的 key 表；任一非可选部件缺失或取不到即拒绝，
 * 且**不写部分 key**（半套 key 比没有更糟：渲染会拿到不完整的模板）。
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
  const ok: Partial<Record<PartName, string>> = {};

  for (const part of PART_ORDER) {
    const key = input.keys[part];
    if (!key) {
      if (part === 'footer') continue; // 契约允许没有结尾
      missing.push(`${PART_LABELS[part]}（未提供 key）`);
      continue;
    }
    try {
      await input.backend.importComponentByKey(key);
      ok[part] = key;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // 只有「找不到已发布组件」才算未发布；连不上文件是另一回事，
      // 否则插件没开时会误报「你还没发布」。
      if (/published component|Could not find/i.test(msg)) {
        missing.push(`${PART_LABELS[part]}（key ${key.slice(0, 8)}… 取不到，多半还没发布）`);
      } else {
        transport.push(`${PART_LABELS[part]}: ${msg.slice(0, 160)}`);
      }
    }
  }

  if (transport.length > 0) {
    throw compileError(
      COMPILE_CODES.VERIFY_UNAVAILABLE,
      `冒烟跑不起来（不是发布问题）：${transport.join('；')}——` +
        '请把连接插件开在源项目文件里（不能是库文件本身），再重试'
    );
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
    anchors: input.anchors ?? {}
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
