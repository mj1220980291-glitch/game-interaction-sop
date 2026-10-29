/**
 * run 契约：编译瘦身与编译期探针。
 *
 * 这一份锁的是「产物形状」——瘦身之后簇里还剩什么、配图长什么样、探针什么时候
 * 该拒绝。形状不对时渲染拿不到可用槽位，`官方1.14` 已经因此重编过两次。
 *
 * Spec: openspec/changes/slot-run-contract
 */

import { describe, it, expect } from 'vitest';
import { slimParts } from '../../src/v2/compile/slim-parts.js';
import { assertSourceRuns, verifyCompiledCluster } from '../../src/v2/compile/run-contract.js';
import { slotsBackend } from './helpers/slots-backend.js';
import { bareFigureRun, officialTwoRuns } from './fixtures/slot-runs.js';
import { n } from './helpers/slots-backend.js';

describe('slimParts · run 契约', () => {
  it('两段 run：保留第一段全部成员，第二段连根删', async () => {
    const h = slotsBackend(officialTwoRuns());
    const r = await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'single-block', figure: 'named-group', clusterGroups: 'slot-run' }
    });

    expect(h.childrenOf('k').map((x) => x.name)).toEqual([
      '标题',
      '#Title',
      'Frame 427319720',
      '正文/规则',
      '正文/规则',
      '配图'
    ]);
    // 第二段 5 个根 + 无：run2 = #Title + 职能帧 + 2 正文 + 配图
    expect(r.deleted).toBe(5);
    expect(h.store.has('rf2')).toBe(false);
    expect(h.store.has('t2')).toBe(false);
    expect(r.gaps).toEqual([]);
  });

  it('保留的配图 GROUP 不被拍平，也不丢占位文案', async () => {
    const h = slotsBackend(officialTwoRuns());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'single-block', figure: 'named-group', clusterGroups: 'slot-run' }
    });

    const figure = h.store.get('f1')!;
    expect(figure.type).toBe('GROUP');
    expect(h.childrenOf('f1').map((x) => x.name)).toEqual(['配图占位', '配图占位文案']);
    expect(h.writes.filter((w) => w.startsWith('placeholder:'))).toEqual([]);
  });

  it('裸矩形配图：包成 GROUP 并补占位文案', async () => {
    const h = slotsBackend(bareFigureRun());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'single-block', figure: 'named-group', clusterGroups: 'slot-run' }
    });

    const figure = h.childrenOf('k').find((x) => x.name === '配图')!;
    expect(figure.type).toBe('GROUP');
    expect(h.childrenOf(figure.id).map((x) => x.name)).toEqual([
      '配图占位',
      '配图占位文案'
    ]);
    expect(h.store.get('figure')!.name).toBe('配图占位');
  });
});

describe('run 契约探针', () => {
  it('原稿可切出完整 run 时放行', async () => {
    const h = slotsBackend(officialTwoRuns());
    await expect(
      assertSourceRuns(h.backend, 'k', 'slot-run')
    ).resolves.toBeUndefined();
  });

  it('原稿没有 #Title 时拒绝', async () => {
    const h = slotsBackend([n('k', '簇', 'COMPONENT', ['b1'], { w: 900, h: 400 }), n('b1', '正文/规则', 'TEXT')]);
    await expect(assertSourceRuns(h.backend, 'k', 'slot-run')).rejects.toMatchObject({
      code: 'V2_COMPILE_RUN_CONTRACT_BROKEN'
    });
  });

  it('非 slot-run 模板不做 run 预检', async () => {
    const h = slotsBackend([n('k', '簇', 'COMPONENT', ['b1'], { w: 900, h: 400 }), n('b1', '正文/规则', 'TEXT')]);
    await expect(assertSourceRuns(h.backend, 'k', 'none')).resolves.toBeUndefined();
  });

  it('产物瘦身后满足契约', async () => {
    const h = slotsBackend(officialTwoRuns());
    await slimParts({
      backend: h.backend,
      parts: [{ part: 'cluster', nodeId: 'k' }],
      capabilities: { overview: 'single-block', figure: 'named-group', clusterGroups: 'slot-run' }
    });
    await expect(verifyCompiledCluster(h.backend, 'k', 'slot-run')).resolves.toEqual([]);
  });

  it('产物还剩两段 run 时报出来', async () => {
    const h = slotsBackend(officialTwoRuns());
    const problems = await verifyCompiledCluster(h.backend, 'k', 'slot-run');
    expect(problems.join('；')).toContain('残留 2 段 run');
  });

  it('配图被拍平成矩形时报出来', async () => {
    const h = slotsBackend(bareFigureRun());
    const problems = await verifyCompiledCluster(h.backend, 'k', 'slot-run');
    expect(problems.join('；')).toContain('应为 GROUP');
  });
});
