/**
 * run 边界规则的自检。
 *
 * 这条规则一旦分叉，编译端和渲染端就会对同一个簇给出不同答案——`官方1.14`
 * 重编后的配图拍平、正文少一条都是这么来的。
 *
 * Spec: openspec/changes/slot-run-contract
 */

import { describe, it, expect } from 'vitest';
import {
  splitRuns,
  isCompleteRun,
  firstCompleteRun,
  type RunNode
} from '../../src/v2/template/runs.js';
import { SECTION_CHILD_NAMES } from '../../src/v2/template-map.js';
import { CLUSTER_SLOTS } from '../../src/v2/template-slots.js';

let seq = 0;
function node(name: string, type = 'TEXT'): RunNode {
  seq += 1;
  return { id: `n${seq}`, name, type };
}

const TITLE_GROUP = (): RunNode => node('标题', 'GROUP');
const GROUP_TITLE = (): RunNode => node(SECTION_CHILD_NAMES.clusterSubTitle);
const ROLE_FRAME = (suffix = '427319720'): RunNode => node(`Frame ${suffix}`, 'FRAME');
const BODY = (): RunNode => node(SECTION_CHILD_NAMES.clusterBulletText);
const FIGURE = (type = 'GROUP'): RunNode => node(SECTION_CHILD_NAMES.optionalImagePlaceholder, type);

describe('splitRuns', () => {
  it('两段 run：表头与每段成员各归其位', () => {
    const children = [
      TITLE_GROUP(),
      GROUP_TITLE(),
      ROLE_FRAME(),
      BODY(),
      BODY(),
      FIGURE(),
      GROUP_TITLE(),
      ROLE_FRAME('427319721'),
      BODY(),
      BODY(),
      FIGURE()
    ];
    const split = splitRuns(children);

    expect(split.header).toHaveLength(1);
    expect(split.header[0]?.name).toBe('标题');
    expect(split.runs).toHaveLength(2);
    for (const run of split.runs) {
      expect(run.title?.name).toBe(SECTION_CHILD_NAMES.clusterSubTitle);
      expect(run.roleFrame?.type).toBe('FRAME');
      expect(run.body).toHaveLength(2);
      expect(run.figure?.name).toBe(CLUSTER_SLOTS.figure);
    }
    expect(split.runs[0]?.roleFrame?.name).toBe('Frame 427319720');
    expect(split.runs[1]?.roleFrame?.name).toBe('Frame 427319721');
  });

  it('一个 #Title 都没有：全部归表头，runs 为空', () => {
    const split = splitRuns([TITLE_GROUP(), BODY(), FIGURE()]);
    expect(split.runs).toHaveLength(0);
    expect(split.header).toHaveLength(3);
  });

  it('run 内没有正文：仍然切出一段，但不算完整', () => {
    const split = splitRuns([TITLE_GROUP(), GROUP_TITLE(), ROLE_FRAME(), FIGURE()]);
    expect(split.runs).toHaveLength(1);
    expect(split.runs[0]?.body).toHaveLength(0);
    expect(isCompleteRun(split.runs[0]!)).toBe(false);
  });

  it('配图可以是裸矩形，但别的类型不算', () => {
    const bare = splitRuns([GROUP_TITLE(), BODY(), FIGURE('RECTANGLE')]);
    expect(bare.runs[0]?.figure?.type).toBe('RECTANGLE');

    const text = splitRuns([GROUP_TITLE(), BODY(), FIGURE('TEXT')]);
    expect(text.runs[0]?.figure).toBeUndefined();
  });

  it('clusterGroups = none：整簇一段无标题 run', () => {
    const split = splitRuns([TITLE_GROUP(), BODY(), BODY(), FIGURE('RECTANGLE')], 'none');
    expect(split.header).toHaveLength(0);
    expect(split.runs).toHaveLength(1);
    expect(split.runs[0]?.title).toBeUndefined();
    expect(split.runs[0]?.body).toHaveLength(2);
    expect(split.runs[0]?.figure?.type).toBe('RECTANGLE');
  });

  it('clusterGroups = inline-subtitle：不产生 run', () => {
    const split = splitRuns([TITLE_GROUP(), GROUP_TITLE(), BODY()], 'inline-subtitle');
    expect(split.runs).toHaveLength(0);
    expect(split.header).toHaveLength(3);
  });
});

describe('firstCompleteRun', () => {
  it('跳过不完整的段，取第一个完整的', () => {
    const split = splitRuns([
      GROUP_TITLE(),
      ROLE_FRAME(),
      GROUP_TITLE(),
      BODY(),
      BODY()
    ]);
    const picked = firstCompleteRun(split.runs);
    expect(picked?.body).toHaveLength(2);
  });

  it('没有完整段时返回 undefined', () => {
    const split = splitRuns([GROUP_TITLE(), ROLE_FRAME()]);
    expect(firstCompleteRun(split.runs)).toBeUndefined();
  });
});
