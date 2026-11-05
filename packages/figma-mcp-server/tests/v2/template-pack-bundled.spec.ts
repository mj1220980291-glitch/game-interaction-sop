/**
 * 引擎包内基线模板包（随 npm 分发）。
 *
 * 为什么需要：项目包被 `.gitignore` 忽略、用户包在仓库外，换机器 / 换同事必然要
 * 重新造包，而重造会漏字段（2026-11-04 变色龙项目：丢了 docBackground +
 * sectionShell，浅底浅字整章不可读）。基线包让「装完就能渲染」成立，
 * 用户/项目包永远覆盖它。
 *
 * Spec: template-contract「项目模板包」
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePackWithTrace } from '../../src/v2/template-config.js';

let root = '';
let home = '';
let cwd = '';
let bundled = '';

const pack = (project: string) => ({
  schema_version: 1,
  project,
  components: { top: 'k-top', chapter: 'k-chapter', cluster: 'k-cluster', footer: null }
});

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'gisop-bundled-'));
  home = join(root, 'home');
  cwd = join(root, 'cwd');
  bundled = join(root, 'bundled');
  mkdirSync(join(home, '.game-interaction-sop', 'templates'), { recursive: true });
  mkdirSync(join(cwd, '.interaction-sop'), { recursive: true });
  mkdirSync(bundled, { recursive: true });
  writeFileSync(join(bundled, 'default.json'), JSON.stringify(pack('bundled-default')));
  writeFileSync(join(bundled, '蛋仔派对.json'), JSON.stringify(pack('bundled-egg')));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const PREV_PACK = process.env.GISOP_TEMPLATE_PACK;
afterEach(() => {
  if (PREV_PACK === undefined) delete process.env.GISOP_TEMPLATE_PACK;
  else process.env.GISOP_TEMPLATE_PACK = PREV_PACK;
  rmSync(join(home, '.game-interaction-sop', 'templates', 'default.json'), { force: true });
  rmSync(join(cwd, '.interaction-sop', 'template.json'), { force: true });
});

const lookup = (env: NodeJS.ProcessEnv = {}) =>
  resolvePackWithTrace({ cwd, home, bundledDir: bundled, env: { ...env } });

describe('引擎包内基线包', () => {
  it('没有项目包/用户包时命中 bundled-default', () => {
    const r = lookup();
    expect(r.hit?.origin).toBe('bundled-default');
    expect(r.hit?.pack.project).toBe('bundled-default');
  });

  it('用户 default 覆盖基线', () => {
    writeFileSync(
      join(home, '.game-interaction-sop', 'templates', 'default.json'),
      JSON.stringify(pack('user-default'))
    );
    const r = lookup();
    expect(r.hit?.origin).toBe('default');
    expect(r.hit?.pack.project).toBe('user-default');
  });

  it('项目包覆盖基线（含按项目名的 bundled）', () => {
    writeFileSync(join(cwd, '.interaction-sop', 'template.json'), JSON.stringify(pack('cwd-pack')));
    const r = lookup({ GISOP_PROJECT: '蛋仔派对' });
    expect(r.hit?.origin).toBe('cwd');
  });

  it('项目名命中 bundled-project', () => {
    const r = lookup({ GISOP_PROJECT: '蛋仔派对' });
    expect(r.hit?.origin).toBe('bundled-project');
    expect(r.hit?.pack.project).toBe('bundled-egg');
  });

  it('项目名没命中时退回 bundled-default', () => {
    const r = lookup({ GISOP_PROJECT: '不存在的项目' });
    expect(r.hit?.origin).toBe('bundled-default');
  });

  it('候选轨迹里能看到 bundled 的 missing', () => {
    const r = lookup({ GISOP_PROJECT: '不存在的项目' });
    const why = r.candidates.find((c) => c.origin === 'bundled-project');
    expect(why?.state).toBe('missing');
  });

  it('$GISOP_TEMPLATE_PACK=off 仍然全关', () => {
    const r = lookup({ GISOP_TEMPLATE_PACK: 'off' });
    expect(r.hit).toBeUndefined();
    expect(r.candidates).toHaveLength(0);
    expect(r.disabledByEnv).toBe(true);
  });
});
