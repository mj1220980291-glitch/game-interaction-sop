/**
 * md-contract 生成与只读 contract 阶段。
 *
 * Spec: template-compile「md-contract 产出」/ engine-mcp-server「契约生成阶段」
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMdContract } from '../../src/v2/compile/md-contract.js';
import { compileTemplate } from '../../src/v2/compile/index.js';
import { parseTemplatePack } from '../../src/v2/template/schema.js';
import { COMPILE_CODES } from '../../src/v2/compile/errors.js';
import { partsBackend } from './helpers/parts-backend.js';

function pack(caps: Record<string, string> = {}, components: Record<string, string> = {}) {
  const parsed = parseTemplatePack({
    schema_version: 1,
    project: '测试项目',
    components: {
      top: 'k-top',
      chapter: 'k-chapter',
      cluster: 'k-cluster',
      ...components
    },
    capabilities: caps
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.pack;
}

describe('buildMdContract', () => {
  it('同一模板包重复生成逐字节一致', () => {
    const p = pack();
    expect(buildMdContract(p).content).toBe(buildMdContract(p).content);
  });

  it('clusterGroups=none 的禁写清单含 ####', () => {
    const md = buildMdContract(pack({ clusterGroups: 'none' })).content;
    expect(md).toContain('不要使用 `####`');
  });

  it('overview=none 的禁写清单含总览', () => {
    const md = buildMdContract(pack({ overview: 'none' })).content;
    expect(md).toContain('不要写 `## 设计总览`');
  });

  it('badgeSlot 非 container 时说明标号需人工摆放', () => {
    const md = buildMdContract(pack({ badgeSlot: 'manual' })).content;
    expect(md).toContain('人工摆放');
  });

  it('路径固定为项目根下的约定位置', () => {
    expect(buildMdContract(pack()).path).toBe('.interaction-sop/md-contract.md');
  });
});

describe('compileTemplate phase=contract', () => {
  it('只读生成，不调用任何后端方法', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gisop-contract-'));
    const prev = process.cwd();
    const prevPack = process.env.GISOP_TEMPLATE_PACK;
    try {
      // vitest 里 `GISOP_TEMPLATE_PACK=off` 是为了隔离机上的 default.json；
      // 这个用例要验的正是项目根查找，所以显式打开。
      process.env.GISOP_TEMPLATE_PACK = '';
      mkdirSync(join(dir, '.interaction-sop'), { recursive: true });
      writeFileSync(
        join(dir, '.interaction-sop', 'template.json'),
        JSON.stringify({
          schema_version: 1,
          project: '蛋仔派对',
          components: { top: 'k1', chapter: 'k2', cluster: 'k3', footer: null },
          capabilities: { clusterGroups: 'none' }
        }),
        'utf8'
      );
      process.chdir(dir);
      const h = partsBackend({ id: 'p', name: 'P', type: 'PAGE' });
      const r = await compileTemplate({
        phase: 'contract',
        project: '蛋仔派对',
        source: { nodeId: '1:14' },
        library: { fileKey: 'lib', pageId: '0:1' },
        backend: h.backend
      });
      expect(r.mdContract?.content).toContain('不要使用 `####`');
      expect(h.calls).toEqual([]);
    } finally {
      process.chdir(prev);
      process.env.GISOP_TEMPLATE_PACK = prevPack ?? '';
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('未登记项目返回明确错误', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gisop-contract-empty-'));
    const prev = process.cwd();
    try {
      process.chdir(dir);
      const h = partsBackend({ id: 'p', name: 'P', type: 'PAGE' });
      await expect(
        compileTemplate({
          phase: 'contract',
          project: '不存在',
          source: { nodeId: '1:14' },
          library: { fileKey: 'lib', pageId: '0:1' },
          backend: h.backend
        })
      ).rejects.toMatchObject({ code: COMPILE_CODES.PARTS_NOT_REGISTERED });
    } finally {
      process.chdir(prev);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
