/**
 * 模板包解析与能力校验。
 *
 * Spec: template-contract「能力枚举与缺省值」「项目模板包」
 * Change: template-contract-and-probe (task 2.3)
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CAPABILITIES,
  parseTemplatePack
} from '../../src/v2/template/schema.js';

describe('parseTemplatePack', () => {
  it('docBackground 按 #rrggbb 读取，写错直接拒绝', () => {
    const ok = parseTemplatePack({ schema_version: 1, docBackground: '#232429' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.pack.docBackground).toBe('#232429');

    expect(parseTemplatePack({ schema_version: 1 }).ok).toBe(true);
    const bad = parseTemplatePack({ schema_version: 1, docBackground: 'black' });
    expect(bad.ok).toBe(false);
  });

  it('只给 schema_version 时全部回落缺省值，且缺省值等价官方 1:14', () => {
    const r = parseTemplatePack({ schema_version: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.capabilities).toEqual(DEFAULT_CAPABILITIES);
    expect(r.pack.capabilities).toMatchObject({
      overview: 'two-frames',
      clusterGroups: 'slot-run',
      badgeSlot: 'container',
      numberBadge: 'text',
      roleAnnotation: 'component-variant',
      figure: 'named-group',
      hiddenPool: 'ignore',
      column: 'right'
    });
    expect(r.pack.components).toEqual({ top: null, chapter: null, cluster: null, footer: null });
    expect(r.pack.anchors).toEqual({});
  });

  it('未知能力取值报错，不回落到缺省', () => {
    const r = parseTemplatePack({
      schema_version: 1,
      capabilities: { numberBadge: 'triangle' }
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toContain('capabilities.numberBadge');
    expect(r.errors.join('\n')).toContain('text / instance / none');
  });

  it('未知能力键报错', () => {
    const r = parseTemplatePack({
      schema_version: 1,
      capabilities: { badgeShape: 'triangle' }
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toContain('unknown capability "badgeShape"');
  });

  it('schema_version 不匹配报错', () => {
    const r = parseTemplatePack({ schema_version: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toContain('schema_version must be 1');
  });

  it('anchors 缺省可接受，给了也能解析', () => {
    expect(parseTemplatePack({ schema_version: 1 }).ok).toBe(true);
    const r = parseTemplatePack({
      schema_version: 1,
      anchors: {
        clusterTitle: { kind: 'name', value: '界面标题' },
        figureSlot: { kind: 'invisible-frame', value: '#figure' }
      }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.anchors['clusterTitle']).toEqual({ kind: 'name', value: '界面标题' });
  });

  it('anchors 的 kind 越界报错', () => {
    const r = parseTemplatePack({
      schema_version: 1,
      anchors: { clusterTitle: { kind: 'color', value: 'red' } }
    });
    expect(r.ok).toBe(false);
  });

  it('四个部件 key 原样读出，footer 可缺省', () => {
    const r = parseTemplatePack({
      schema_version: 1,
      project: '惊魂寻宝队',
      components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster' },
      capabilities: {
        overview: 'none',
        clusterGroups: 'none',
        badgeSlot: 'manual',
        numberBadge: 'instance',
        roleAnnotation: 'inline-suffix',
        figure: 'first-non-text',
        hiddenPool: 'reuse'
      },
      source: { fileKey: 'UYCJ', nodeIds: ['798:17608'], fingerprint: 'sha256:abc' }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.components).toEqual({
      top: 'k-top',
      chapter: 'k-chapter',
      cluster: 'k-cluster',
      footer: null
    });
    expect(r.pack.capabilities.overview).toBe('none');
    expect(r.pack.capabilities.hiddenPool).toBe('reuse');
    expect(r.pack.capabilities.column).toBe('right');
    expect(r.pack.source?.fingerprint).toBe('sha256:abc');
    expect(r.pack.project).toBe('惊魂寻宝队');
  });

  it('组件 key 为 null 表示编译前占位，不算错误', () => {
    const r = parseTemplatePack({
      schema_version: 1,
      components: { top: null, chapter: null, cluster: null, footer: null }
    });
    expect(r.ok).toBe(true);
  });

  it('未知 components 字段只告警', () => {
    const r = parseTemplatePack({
      schema_version: 1,
      components: { top: 'k', body: 'k2' }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.join('\n')).toContain('unknown components key "body"');
  });

  it('非对象输入报错', () => {
    expect(parseTemplatePack(null).ok).toBe(false);
    expect(parseTemplatePack('{"schema_version":1}').ok).toBe(false);
  });
});
