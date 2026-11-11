/**
 * 模板包「后果自检」。
 *
 * 判据刻意不看「字段齐不齐」：模板结构可以不同，确实可能用不到某些观感字段
 * （用户决策 2026-11-05）。只看两个后果：
 *   1. 这次是不是用了默认观感；
 *   2. 正文还读不读得清。
 *
 * 两条都是软告警，不改变渲染结论。
 *
 * Spec: template-render「渲染后 SHALL 做观感后果自检」等三条
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { FigmaBackend } from '../../src/v2/figma-client.js';
import {
  auditPackFields,
  auditRenderedContrast,
  contrastMinFromEnv,
  smokePackKeys,
  DEFAULT_CONTRAST_MIN
} from '../../src/v2/pack-audit.js';

const FULL_PACK = {
  schema_version: 1,
  components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: null },
  capabilities: {},
  docBackground: '#1E1E1E',
  geometry: {
    docBackground: '#1E1E1E',
    sectionShell: [
      { padding: { top: 64, right: 64, bottom: 64, left: 64 }, fill: '#000000' }
    ]
  }
} as never;

const BARE_PACK = {
  schema_version: 1,
  components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: null },
  capabilities: {}
} as never;

describe('字段体检（只报默认值，不判错）', () => {
  it('完整包不告警', () => {
    expect(auditPackFields(FULL_PACK)).toHaveLength(0);
  });

  it('黑边画在文档根时不催 sectionShell（蛋仔型）', () => {
    const rootWhitespace = {
      schema_version: 1,
      components: { top: 'a', chapter: 'b', cluster: 'c', footer: null },
      capabilities: {},
      docBackground: '#232429',
      geometry: {
        docBackground: '#232429',
        docPadding: { top: 0, right: 60, bottom: 0, left: 60 }
      }
    } as never;
    expect(auditPackFields(rootWhitespace)).toHaveLength(0);
  });

  it('两项都缺时一条聚合告警，两个字段都点名', () => {
    const w = auditPackFields(BARE_PACK);
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe('V2_W_PACK_GEOMETRY_DEFAULTED');
    expect(w[0].message).toContain('docBackground');
    expect(w[0].message).toContain('sectionShell');
    expect(w[0].message).toContain('这不是错误');
  });

  it('只缺 sectionShell 时只点名它', () => {
    const pack = {
      ...(BARE_PACK as Record<string, unknown>),
      geometry: { docBackground: '#1E1E1E' }
    } as never;
    const w = auditPackFields(pack);
    expect(w[0].message).toContain('sectionShell');
    expect(w[0].message).not.toContain('docBackground /');
  });

  it('没有 pack 时不报（legacy 路径）', () => {
    expect(auditPackFields(undefined)).toHaveLength(0);
  });
});

describe('对比度体检', () => {
  const prev = process.env.GISOP_CONTRAST_MIN;
  afterEach(() => {
    if (prev === undefined) delete process.env.GISOP_CONTRAST_MIN;
    else process.env.GISOP_CONTRAST_MIN = prev;
  });

  it('阈值默认 3，可由 env 覆盖', () => {
    expect(DEFAULT_CONTRAST_MIN).toBe(3);
    expect(contrastMinFromEnv({})).toBe(3);
    expect(contrastMinFromEnv({ GISOP_CONTRAST_MIN: '4.5' })).toBe(4.5);
    expect(contrastMinFromEnv({ GISOP_CONTRAST_MIN: 'abc' })).toBe(3);
  });

  it('低对比章节产出一条聚合告警（含章节名与颜色）', async () => {
    const backend = {
      async auditTextContrast() {
        return [
          {
            rootId: 'ch1',
            checked: 42,
            lowContrast: 42,
            skipped: 0,
            samples: [{ textId: 't1', textFill: '#EEEEEE', bgFill: '#FFFFFF', ratio: 1.12 }]
          }
        ];
      }
    } as unknown as FigmaBackend;

    const w = await auditRenderedContrast(backend, [{ id: 'ch1', name: '界面说明1' }]);
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe('V2_W_TEXT_CONTRAST_LOW');
    expect(w[0].message).toContain('界面说明1');
    expect(w[0].message).toContain('42');
    expect(w[0].message).toContain('#EEEEEE');
    expect(w[0].message).toContain('1.12:1');
  });

  it('没有低对比条目不告警', async () => {
    const backend = {
      async auditTextContrast() {
        return [{ rootId: 'ch1', checked: 10, lowContrast: 0, skipped: 0 }];
      }
    } as unknown as FigmaBackend;
    expect(await auditRenderedContrast(backend, [{ id: 'ch1' }])).toHaveLength(0);
  });

  it('后端没有该能力时静默跳过', async () => {
    const backend = {} as unknown as FigmaBackend;
    expect(await auditRenderedContrast(backend, [{ id: 'ch1' }])).toHaveLength(0);
  });

  it('体检自己失败时不拖累渲染', async () => {
    const logs: string[] = [];
    const backend = {
      async auditTextContrast() {
        throw new Error('bridge hiccup');
      }
    } as unknown as FigmaBackend;
    const w = await auditRenderedContrast(backend, [{ id: 'ch1' }], {
      log: (m) => logs.push(m)
    });
    expect(w).toHaveLength(0);
    expect(logs.join(' ')).toContain('bridge hiccup');
  });
});

describe('deep 冒烟：缺 key 不崩', () => {
  it('footer 为 null 时跳过，其余三个照常冒烟', async () => {
    const seen: string[] = [];
    const backend = {
      async instantiateByKey({ componentKey }: { componentKey: string }) {
        seen.push(componentKey);
        return { id: `tmp-${componentKey}` };
      },
      async deleteNodes() {}
    } as unknown as FigmaBackend;

    const keys = await smokePackKeys(backend, {
      top: 'k-top',
      chapter: 'k-chapter',
      cluster: 'k-cluster',
      footer: null
    });

    expect(keys.map((k) => k.part)).toEqual(['top', 'chapter', 'cluster']);
    expect(keys.every((k) => k.ok)).toBe(true);
    expect(seen).toHaveLength(3);
  });

  it('key 在但 import 不到时只记这一条失败，不抛', async () => {
    const backend = {
      async instantiateByKey({ componentKey }: { componentKey: string }) {
        if (componentKey === 'stale') throw new Error('Could not find published component');
        return { id: 'tmp' };
      },
      async deleteNodes() {}
    } as unknown as FigmaBackend;

    const keys = await smokePackKeys(backend, {
      top: 'stale',
      chapter: 'ok',
      cluster: null,
      footer: null
    });

    expect(keys).toHaveLength(2);
    expect(keys[0].ok).toBe(false);
    expect(keys[0].error).toContain('Could not find');
    expect(keys[1].ok).toBe(true);
  });

  it('整包都是 null 时返回空数组', async () => {
    const backend = {
      async instantiateByKey() {
        throw new Error('不该被调用');
      },
      async deleteNodes() {}
    } as unknown as FigmaBackend;
    expect(
      await smokePackKeys(backend, { top: null, chapter: null, cluster: null, footer: null })
    ).toEqual([]);
  });
});
