/**
 * 统一槽位命名 —— 归一化模板的契约词汇表。
 *
 * 部件在我们自己的库文件里，所以可以给槽位改名：改名不改外观、不动项目源模板、
 * 也不影响设计师。换来的好处是渲染期只按名字取值——不猜形状、不读 plugin data、
 * 不需要在 `template.json` 里写一堆 `anchors`。
 *
 * 名字取自 `template-map.ts`（`1:14` 的既有图层名），因此官方模板的已发布部件
 * 天然符合统一命名，不用重编。
 *
 * Spec: openspec/changes/engine-multi-part-template-render (D1 / template-contract)
 */

import { HEADER_NAMES, OVERVIEW_NAMES, SECTION_CHILD_NAMES } from './template-map.js';

/** `<项目> / 顶部` 内部槽位。 */
export const TOP_SLOTS = {
  docTitle: HEADER_NAMES.title,
  owner: HEADER_NAMES.owner,
  group: HEADER_NAMES.group,
  ticketLink: HEADER_NAMES.ticketLink,
  lastUpdate: HEADER_NAMES.lastUpdate,
  overviewBackground: OVERVIEW_NAMES.background,
  overviewCore: OVERVIEW_NAMES.coreInteraction
} as const;

/** 顶部总览块内部的文本槽位（`功能背景` / `核心交互` 各一份）。 */
export const OVERVIEW_TEXT_SLOTS = {
  heading: OVERVIEW_NAMES.heading,
  body: OVERVIEW_NAMES.body
} as const;

/** `<项目> / 章节` 内部槽位。 */
export const CHAPTER_SLOTS = {
  sectionTitle: SECTION_CHILD_NAMES.interfaceNameLabel,
  /** 标题块（装 `#Name` 的那层，官方叫 `#Name/界面名称`）。 */
  titleBlock: '标题',
  /** 左列：标题 + 舞台，纵向自动布局。 */
  leftColumn: '左列',
  /** 舞台：图区与气泡的共同父级（官方叫 `rec组`）。 */
  stage: '舞台',
  mainImage: SECTION_CHILD_NAMES.mainImagePlaceholder,
  mainImageHint: SECTION_CHILD_NAMES.mainImagePlaceholderHint,
  badgeContainer: SECTION_CHILD_NAMES.bubbleOverlayFrame,
  badgeMaster: '标号/母版',
  clusterHost: SECTION_CHILD_NAMES.rightColumnContainer
} as const;

/** `<项目> / 簇` 内部槽位。 */
export const CLUSTER_SLOTS = {
  number: SECTION_CHILD_NAMES.clusterNumberText,
  title: SECTION_CHILD_NAMES.clusterTitle,
  groupSlot: SECTION_CHILD_NAMES.clusterSubTitle,
  bullet: SECTION_CHILD_NAMES.clusterBulletText,
  figure: SECTION_CHILD_NAMES.optionalImagePlaceholder,
  figureRect: SECTION_CHILD_NAMES.optionalImageRect,
  figureHint: SECTION_CHILD_NAMES.optionalImagePlaceholderHint,
  roleFrame: '职能标记'
} as const;

/** 标号名字族：`标号/1`、`标号/母版`。 */
export const BADGE_NAME_PREFIX = SECTION_CHILD_NAMES.bubbleNumberPrefix;

/** 母版名字（隐藏，渲染时克隆它）。 */
export const BADGE_MASTER_NAME = CHAPTER_SLOTS.badgeMaster;

/**
 * 旧命名兼容：`1:14` 的职能标签帧叫 `Frame 427319720`。
 * 只读兼容——渲染不会去改已发布部件。
 */
export const LEGACY_ROLE_FRAME_PREFIX = 'Frame 4273';

export type PartName = 'top' | 'chapter' | 'cluster' | 'footer';

/**
 * 关键槽位：缺任何一个都画不出正确文档，编译期就该拒绝，渲染期也只报错不猜。
 *
 * 章节标题 `#Name` 不算关键：部分项目的章节标题是共用的一块（不在章节部件里），
 * 缺它只影响标题文案，不影响文档结构，记缺口即可。
 */
export const CRITICAL_SLOTS: ReadonlyArray<{ part: PartName; slot: string }> = [
  { part: 'chapter', slot: CHAPTER_SLOTS.mainImage },
  { part: 'chapter', slot: CHAPTER_SLOTS.clusterHost },
  { part: 'cluster', slot: CLUSTER_SLOTS.number },
  { part: 'cluster', slot: CLUSTER_SLOTS.title },
  { part: 'cluster', slot: CLUSTER_SLOTS.bullet }
];

/** `标号/母版` 之外的标号，例如 `标号/1`。 */
export function isBadgeFrame(name: string): boolean {
  return name.startsWith(BADGE_NAME_PREFIX);
}

export function isBadgeMaster(name: string): boolean {
  return name === BADGE_MASTER_NAME;
}

/** 统一名 `职能标记`，或旧前缀 `Frame 4273*`。 */
export function isRoleFrame(name: string): boolean {
  return name === CLUSTER_SLOTS.roleFrame || name.startsWith(LEGACY_ROLE_FRAME_PREFIX);
}
