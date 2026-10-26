/**
 * 模板包查找与 template-config 回落行为。
 *
 * Spec: template-contract「项目模板包」/ 无模板包时行为不变
 * Change: template-contract-and-probe (task 3.3)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_TEMPLATE,
  loadTemplatePack,
  resolveTemplateConfig
} from '../../src/v2/template-config.js';
import { DEFAULT_CAPABILITIES } from '../../src/v2/template/schema.js';

let dir = '';
let packPath = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gisop-pack-'));
  packPath = join(dir, 'template.json');
  writeFileSync(
    packPath,
    JSON.stringify({
      schema_version: 1,
      project: '惊魂寻宝队',
      components: {
        top: 'k-top',
        chapter: 'k-chapter',
        cluster: 'k-cluster',
        footer: null
      },
      capabilities: { overview: 'none', numberBadge: 'instance' },
      source: { fileKey: 'UYCJ', nodeIds: ['798:17608'] }
    })
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const NO_FILES = { GISOP_TEMPLATE_CONFIG: 'off', GISOP_TEMPLATE_PACK: 'off' } as NodeJS.ProcessEnv;

describe('loadTemplatePack', () => {
  it('显式路径可读', () => {
    const found = loadTemplatePack({ env: { GISOP_TEMPLATE_PACK: packPath } as NodeJS.ProcessEnv });
    expect(found?.pack.components.chapter).toBe('k-chapter');
    expect(found?.path).toBe(packPath);
  });

  it('off 关闭查找', () => {
    expect(loadTemplatePack({ env: NO_FILES })).toBeUndefined();
  });

  it('从项目根 .interaction-sop/template.json 读取', () => {
    const root = mkdtempSync(join(tmpdir(), 'gisop-proj-'));
    mkdirSync(join(root, '.interaction-sop'), { recursive: true });
    writeFileSync(
      join(root, '.interaction-sop', 'template.json'),
      JSON.stringify({ schema_version: 1, project: 'p', capabilities: { column: 'bottom' } })
    );
    const found = loadTemplatePack({
      cwd: root,
      env: { ...NO_FILES, GISOP_TEMPLATE_PACK: '' } as NodeJS.ProcessEnv
    });
    expect(found?.pack.capabilities.column).toBe('bottom');
    rmSync(root, { recursive: true, force: true });
  });

  it('无效 JSON 被跳过，不抛错', () => {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{ not json');
    expect(loadTemplatePack({ env: { GISOP_TEMPLATE_PACK: bad } as NodeJS.ProcessEnv })).toBeUndefined();
  });

  it('schema_version 不匹配被跳过', () => {
    const bad = join(dir, 'v2.json');
    writeFileSync(bad, JSON.stringify({ schema_version: 2 }));
    expect(loadTemplatePack({ env: { GISOP_TEMPLATE_PACK: bad } as NodeJS.ProcessEnv })).toBeUndefined();
  });
});

describe('resolveTemplateConfig 与模板包', () => {
  it('无模板包时逐字段与改动前一致', () => {
    const cfg = resolveTemplateConfig(undefined, NO_FILES, { cwd: dir });
    expect(cfg).toEqual({ fileKey: DEFAULT_TEMPLATE.fileKey, nodeId: DEFAULT_TEMPLATE.nodeId });
    expect(cfg.pack).toBeUndefined();
  });

  it('有模板包时挂上 pack，地址解析不受影响', () => {
    const cfg = resolveTemplateConfig(
      undefined,
      { ...NO_FILES, GISOP_TEMPLATE_PACK: packPath } as NodeJS.ProcessEnv,
      { cwd: dir }
    );
    expect(cfg.fileKey).toBe(DEFAULT_TEMPLATE.fileKey);
    expect(cfg.nodeId).toBe(DEFAULT_TEMPLATE.nodeId);
    expect(cfg.pack?.components.top).toBe('k-top');
    expect(cfg.pack?.capabilities.overview).toBe('none');
    expect(cfg.pack?.capabilities.numberBadge).toBe('instance');
    // 未配置的能力仍取缺省
    expect(cfg.pack?.capabilities.column).toBe(DEFAULT_CAPABILITIES.column);
    expect(cfg.packPath).toBe(packPath);
  });

  it('显式入参优先级仍高于模板包', () => {
    const cfg = resolveTemplateConfig(
      { fileKey: 'EXPLICIT', nodeId: '9:9' },
      { ...NO_FILES, GISOP_TEMPLATE_PACK: packPath } as NodeJS.ProcessEnv,
      { cwd: dir }
    );
    expect(cfg.fileKey).toBe('EXPLICIT');
    expect(cfg.nodeId).toBe('9:9');
  });
});
