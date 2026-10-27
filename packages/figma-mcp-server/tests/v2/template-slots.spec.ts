/**
 * 统一槽位命名表的自检。
 *
 * 目的只有一个：保证「统一名」与 `1:14` 既有名字不漂移。官方模板的已发布部件
 * 不重编就要能被新渲染路径使用，两边名字一旦分叉，线上表现是「槽位找不到」。
 *
 * Spec: template-contract「统一槽位命名」
 */

import { describe, it, expect } from 'vitest';
import {
  SECTION_CHILD_NAMES,
  HEADER_NAMES,
  OVERVIEW_NAMES
} from '../../src/v2/template-map.js';
import {
  CHAPTER_SLOTS,
  CLUSTER_SLOTS,
  TOP_SLOTS,
  OVERVIEW_TEXT_SLOTS,
  BADGE_MASTER_NAME,
  CRITICAL_SLOTS,
  isBadgeFrame,
  isBadgeMaster,
  isRoleFrame
} from '../../src/v2/template-slots.js';

describe('统一槽位命名', () => {
  it('章节槽位与 1:14 既有名字一致', () => {
    expect(CHAPTER_SLOTS.sectionTitle).toBe(SECTION_CHILD_NAMES.interfaceNameLabel);
    expect(CHAPTER_SLOTS.mainImage).toBe(SECTION_CHILD_NAMES.mainImagePlaceholder);
    expect(CHAPTER_SLOTS.mainImageHint).toBe(SECTION_CHILD_NAMES.mainImagePlaceholderHint);
    expect(CHAPTER_SLOTS.badgeContainer).toBe(SECTION_CHILD_NAMES.bubbleOverlayFrame);
    expect(CHAPTER_SLOTS.clusterHost).toBe(SECTION_CHILD_NAMES.rightColumnContainer);
  });

  it('簇槽位与 1:14 既有名字一致', () => {
    expect(CLUSTER_SLOTS.number).toBe(SECTION_CHILD_NAMES.clusterNumberText);
    expect(CLUSTER_SLOTS.title).toBe(SECTION_CHILD_NAMES.clusterTitle);
    expect(CLUSTER_SLOTS.groupSlot).toBe(SECTION_CHILD_NAMES.clusterSubTitle);
    expect(CLUSTER_SLOTS.bullet).toBe(SECTION_CHILD_NAMES.clusterBulletText);
    expect(CLUSTER_SLOTS.figure).toBe(SECTION_CHILD_NAMES.optionalImagePlaceholder);
    expect(CLUSTER_SLOTS.figureRect).toBe(SECTION_CHILD_NAMES.optionalImageRect);
    expect(CLUSTER_SLOTS.figureHint).toBe(SECTION_CHILD_NAMES.optionalImagePlaceholderHint);
  });

  it('顶部槽位与 1:14 既有名字一致', () => {
    expect(TOP_SLOTS.docTitle).toBe(HEADER_NAMES.title);
    expect(TOP_SLOTS.owner).toBe(HEADER_NAMES.owner);
    expect(TOP_SLOTS.group).toBe(HEADER_NAMES.group);
    expect(TOP_SLOTS.ticketLink).toBe(HEADER_NAMES.ticketLink);
    expect(TOP_SLOTS.lastUpdate).toBe(HEADER_NAMES.lastUpdate);
    expect(TOP_SLOTS.overviewBackground).toBe(OVERVIEW_NAMES.background);
    expect(TOP_SLOTS.overviewCore).toBe(OVERVIEW_NAMES.coreInteraction);
    expect(OVERVIEW_TEXT_SLOTS.body).toBe('#Content');
  });

  it('字面值锁定：渲染只认这些名字', () => {
    expect(CHAPTER_SLOTS).toEqual({
      sectionTitle: '#Name',
      mainImage: '主图占位',
      mainImageHint: '主图占位文案',
      badgeContainer: '气泡',
      badgeMaster: '标号/母版',
      clusterHost: 'Text'
    });
    expect(CLUSTER_SLOTS.bullet).toBe('正文/规则');
    expect(CLUSTER_SLOTS.roleFrame).toBe('职能标记');
    expect(TOP_SLOTS.docTitle).toBe('文档标题');
  });

  it('标号名字族可区分母版', () => {
    expect(isBadgeFrame('标号/1')).toBe(true);
    expect(isBadgeFrame('标号/母版')).toBe(true);
    expect(isBadgeMaster(BADGE_MASTER_NAME)).toBe(true);
    expect(isBadgeMaster('标号/1')).toBe(false);
    expect(isBadgeFrame('气泡')).toBe(false);
  });

  it('职能标签帧接受统一名与旧前缀', () => {
    expect(isRoleFrame('职能标记')).toBe(true);
    expect(isRoleFrame('Frame 427319720')).toBe(true);
    expect(isRoleFrame('Frame 12')).toBe(false);
    expect(isRoleFrame('标题')).toBe(false);
  });

  it('关键槽位覆盖章节与簇的必需项', () => {
    const key = CRITICAL_SLOTS.map((s) => `${s.part}.${s.slot}`);
    expect(key).toContain(`chapter.${CHAPTER_SLOTS.mainImage}`);
    expect(key).toContain(`chapter.${CHAPTER_SLOTS.clusterHost}`);
    expect(key).toContain(`cluster.${CLUSTER_SLOTS.bullet}`);
    // 章节标题不进关键槽位：部分项目的标题是共用的一块，缺它只影响文案。
    expect(key).not.toContain(`chapter.${CHAPTER_SLOTS.sectionTitle}`);
  });
});
