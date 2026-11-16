import { describe, it, expect } from 'vitest';
import type { FigmaBackend, NodeInfo } from '../../src/v2/figma-client.js';
import { DEFAULT_CAPABILITIES } from '../../src/v2/template/schema.js';
import { preflight } from '../../src/v2/compile/preflight.js';
import { buildTemplatePack, classifyVerifyError, verifyPublished } from '../../src/v2/compile/backfill.js';

function backend(opts: { pageType?: NodeInfo['type']; published?: string[]; failImport?: boolean } = {}) {
  return {
    async getNodeInfo(id: string) {
      return { id, name: 'Page', type: opts.pageType ?? 'PAGE' } as NodeInfo;
    },
    async cloneNode() {
      return { id: 'c', name: 'c', type: 'FRAME' } as NodeInfo;
    },
    async createComponentFromNode() {
      return { id: 'comp', name: 'comp', type: 'COMPONENT' } as NodeInfo;
    },
    async setPluginData() {},
    async importComponentByKey(key: string) {
      if (opts.failImport || !(opts.published ?? []).includes(key)) {
        throw new Error(`Could not find a published component with the key "${key}"`);
      }
      return { id: 'lib', name: 'lib', type: 'COMPONENT' } as NodeInfo;
    }
  } as unknown as FigmaBackend;
}

describe('preflight', () => {
  it('通过时返回 ok', async () => {
    await expect(preflight({ backend: backend(), libraryPageId: 'p1' })).resolves.toEqual({ ok: true });
  });

  it('后端缺能力 → 库不可写', async () => {
    await expect(
      preflight({ backend: { ...backend(), createComponentFromNode: undefined } as unknown as FigmaBackend, libraryPageId: 'p1' })
    ).rejects.toThrow(/createComponentFromNode/);
  });

  it('落点不是页面 → 库不可写', async () => {
    await expect(
      preflight({ backend: backend({ pageType: 'FRAME' }), libraryPageId: 'f1' })
    ).rejects.toThrow(/不是页面/);
  });

  it('指纹不一致 → 源模板漂移', async () => {
    await expect(
      preflight({
        backend: backend(),
        libraryPageId: 'p1',
        expectedFingerprint: 'sha256:aaa',
        actualFingerprint: 'sha256:bbb'
      })
    ).rejects.toThrow(/先重跑探针/);
  });

  it('差异不可表达 → 拒绝并列出原因', async () => {
    await expect(
      preflight({
        backend: backend(),
        libraryPageId: 'p1',
        expressible: { ok: false, reasons: ['column 只支持 right / bottom'] }
      })
    ).rejects.toThrow(/column 只支持/);
  });
});

describe('verifyPublished', () => {
  const keys = { top: 'k-top', chapter: 'k-ch', cluster: 'k-cl' };

  it('全部取到 → 返回 key 表', async () => {
    const r = await verifyPublished({
      backend: backend({ published: ['k-top', 'k-ch', 'k-cl'] }),
      keys
    });
    expect(r).toEqual(keys);
  });

  it('footer 可缺省，不报错', async () => {
    const r = await verifyPublished({
      backend: backend({ published: ['k-top', 'k-ch', 'k-cl'] }),
      keys: { ...keys, footer: null }
    });
    expect(r.footer).toBeUndefined();
  });

  it('有 key 但取不到 → NOT_PUBLISHED，且不返回部分 key', async () => {
    await expect(
      verifyPublished({ backend: backend({ published: ['k-top'] }), keys })
    ).rejects.toThrow(/章节/);
  });

  it('连不上文件时不当成「未发布」', async () => {
    const broken = {
      async importComponentByKey() {
        throw new Error('Cannot connect to Figma Desktop.');
      }
    } as unknown as FigmaBackend;
    await expect(verifyPublished({ backend: broken, keys })).rejects.toThrow(/冒烟跑不起来/);
  });

  it('缺章节 key → 直接拒绝', async () => {
    await expect(
      verifyPublished({ backend: backend({ published: ['k-top'] }), keys: { top: 'k-top', cluster: 'k-cl' } })
    ).rejects.toThrow(/未提供 key/);
  });

  it('桥级失败短路：只试第一个部件，并标明未尝试与明细', async () => {
    const tried: string[] = [];
    const broken = {
      async importComponentByKey(key: string) {
        tried.push(key);
        throw new Error(
          `[importComponentByKey key=${key} file=SANDBOX] figma_execute failed: Cannot connect to Figma Desktop.`
        );
      }
    } as unknown as FigmaBackend;
    let err: (Error & { code?: string; details?: unknown }) | undefined;
    try {
      await verifyPublished({ backend: broken, keys });
    } catch (e) {
      err = e as typeof err;
    }
    expect(tried).toEqual(['k-top']);
    expect(err!.code).toBe('V2_COMPILE_VERIFY_UNAVAILABLE');
    expect(err!.message).toContain('no-client');
    expect(err!.message).toContain('未尝试：章节/簇');
    expect(err!.message).toContain('尝试明细：顶部');
    expect(err!.message).toContain('桥快照 port=');
    const details = err!.details as { attempts: Array<{ part: string; errorKind: string; elapsedMs: number }>; skipped: string[] };
    expect(details.attempts).toHaveLength(1);
    expect(details.attempts[0]).toMatchObject({ part: 'top', errorKind: 'no-client' });
    expect(details.skipped).toEqual(['chapter', 'cluster']);
  });

  it('无回程（NO_REPLY）同样短路', async () => {
    const broken = {
      async importComponentByKey() {
        throw Object.assign(new Error('figma_execute 在 20000ms 内没有回程'), { code: 'V2_BRIDGE_NO_REPLY' });
      }
    } as unknown as FigmaBackend;
    await expect(verifyPublished({ backend: broken, keys })).rejects.toThrow(/no-reply/);
  });

  it('多个未发布仍全部聚合，不被短路', async () => {
    const tried: string[] = [];
    const b = {
      async importComponentByKey(key: string) {
        tried.push(key);
        throw new Error(`Could not find a published component with the key "${key}"`);
      }
    } as unknown as FigmaBackend;
    await expect(verifyPublished({ backend: b, keys })).rejects.toThrow(/顶部[\s\S]*章节[\s\S]*簇/);
    expect(tried).toEqual(['k-top', 'k-ch', 'k-cl']);
  });
});

describe('classifyVerifyError', () => {
  it('按原始错误分类，不把桥级错误算成未发布', () => {
    expect(classifyVerifyError(new Error('figma_execute failed: Cannot connect to Figma Desktop.'))).toBe('no-client');
    expect(classifyVerifyError(Object.assign(new Error('x'), { code: 'V2_BRIDGE_NO_REPLY' }))).toBe('no-reply');
    expect(classifyVerifyError(new Error('WebSocket command EXECUTE_CODE timed out after 42000ms'))).toBe('busy');
    expect(classifyVerifyError(new Error('Could not find a published component with the key "k"'))).toBe('not-published');
    expect(classifyVerifyError(new Error('boom'))).toBe('other');
  });
});

describe('buildTemplatePack', () => {
  it('组装出的包能过契约校验', () => {
    const pack = buildTemplatePack({
      project: 'P',
      components: { top: 'k1', chapter: 'k2', cluster: 'k3' },
      capabilities: { ...DEFAULT_CAPABILITIES },
      anchors: { clusterTitle: { kind: 'name', value: '#Title_Main' } }
    });
    expect(pack.components.top).toBe('k1');
    expect(pack.components.footer).toBeNull();
    expect(pack.anchors.clusterTitle!.kind).toBe('name');
    expect(pack.schema_version).toBe(1);
  });
});
