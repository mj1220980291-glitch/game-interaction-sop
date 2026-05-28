/**
 * Figma master template `1:14` (file `UYCJok3MXTWITMfeJSqEF6`) node-ID
 * constants.
 *
 * Source of truth:
 *   skills/game-interaction-sop/references/template-1-14.md
 *
 * Any change to the template structure (renames, regrouping, new slots)
 * must be reflected here AND in the references file. The renderer reads
 * these constants to know which nodes to clone / fill / delete.
 */

/** Figma file containing the master template. */
export const TEMPLATE_FILE_KEY = 'UYCJok3MXTWITMfeJSqEF6';

/** Master COMPONENT node ID. */
export const TEMPLATE_NODE_ID = '1:14';

/**
 * Top-level header text slots. All under `标题组件` (1:15).
 * Each holds a single TEXT node we set characters on.
 */
export const HEADER_SLOTS = {
  /** 文档标题 — receives `# [需求名称]` */
  title: '1:31',
  /** 设计师名称 — receives 跟进UI 值 */
  owner: '1:29',
  /** 需求组名称 — receives 需求组 值 */
  group: '1:27',
  /** 易协作单号链接 — receives 易协作链接 值 */
  ticketLink: '1:28',
  /** 更新时间 — receives 最后更新时间 值 */
  lastUpdate: '1:26'
} as const;

/**
 * Overview FRAME slots. Inside `设计总览组件` (1:32) → `设计总览` (1:33).
 * Each is a FRAME container that holds TWO TEXT children:
 *   - one named `#Title`   ("1.功能背景" / "2.核心交互" small heading) —
 *     MUST be left untouched.
 *   - one named `#Content` (body placeholder "功能背景说明文本...") —
 *     the renderer fills this one with the markdown overview paragraph.
 * The renderer resolves the body TEXT at runtime by `name === '#Content'`,
 * falling back to the last TEXT child if names ever change.
 */
export const OVERVIEW_SLOTS = {
  /** 功能背景 frame — #Content TEXT child receives `### 功能背景` 段 */
  background: '1:36',
  /** 核心交互 frame — #Content TEXT child receives `### 核心交互` 段 */
  coreInteraction: '1:39'
} as const;

/**
 * Section template. The renderer clones from this master once per `## NN.`
 * markdown section.
 *
 * IMPORTANT — TEMPLATE CONSTRAINT:
 *   The parent `需求目标 frame (1:43)` MUST contain exactly ONE
 *   界面说明 child (the master, id 1:44). Any additional sibling
 *   placeholders (e.g. an older 界面说明2 at 1:124) MUST be removed
 *   from the master template, otherwise the renderer's clone+append
 *   ordering will mis-trim and silently drop a freshly-filled section.
 *
 *   The renderer defensively strips spare siblings at runtime via
 *   `removeSparesExceptMaster()`, but the master template itself
 *   should still satisfy this invariant.
 */
export const SECTION_TEMPLATE = {
  /** Master to clone for each `## NN.` */
  masterGroupId: '1:44',
  /** Parent frame that holds all 界面说明 children */
  parentFrameId: '1:43'
} as const;

/**
 * Inside each cloned 界面说明 section:
 *   - #Name TEXT                      — the `## NN.` interface name text
 *   - 主图占位 RECTANGLE               — image placeholder (1920x1080)
 *   - 主图占位文案 TEXT                — "主图占位 待手动替换" hint overlay
 *   - 气泡 FRAME                       — 1920x1080 overlay, holds 标号/N FRAMEs
 *   - 标号/N FRAME                     — numbered bubble, child of 气泡
 *     └── #Number TEXT                 — the bubble number text ("1", "2", ...)
 *   - Text FRAME                       — right column container (AUTO_LAYOUT)
 *     └── 说明块NN                     — cluster block, repeats per ###
 *          ├── Number TEXT             — blue circle number (1-based idx)
 *          ├── #Title_Main TEXT        — cluster title (plain, no "N." prefix)
 *          ├── #Title TEXT             — generic "说明" sub-label (appears twice
 *          │                             in template; renderer trims to 1)
 *          ├── Frame 4273xxxxxx        — role tags FRAME (AUTO_LAYOUT horiz,
 *          │                             contains 7 TEXT children @GUI..@音频)
 *          ├── 正文/规则 TEXT           — bullet line; 1 TEXT = 1 bullet, renderer
 *          │                             clones/trims to match bullet count
 *          └── 配图 GROUP               — optional image placeholder (0, 1 or
 *                                        several in source template per block;
 *                                        renderer applies two-way reconciliation)
 *
 * Fresh IDs are assigned per clone; renderer scans by name.
 *
 * Discrepancy note (2026-05-13): the original v0.1 names in this file
 * (`界面名称`, `小标题块`, `小标题`, `说明文本`, `配图占位`, `角色标签`) did
 * NOT match the actual 1:14 template. Values below reflect the real template.
 */
export const SECTION_CHILD_NAMES = {
  /** TEXT — the `## NN. [界面名称]` interface name label. */
  interfaceNameLabel: '#Name',
  /** RECTANGLE — 1920x1080 main image placeholder. */
  mainImagePlaceholder: '主图占位',
  /** TEXT — "主图占位 待手动替换" hint, hidden after image applied. */
  mainImagePlaceholderHint: '主图占位文案',
  /** FRAME — 1920x1080 overlay on top of 主图占位, parent of 标号/N. */
  bubbleOverlayFrame: '气泡',
  /** FRAME name prefix for numbered bubbles, e.g. "标号/1". */
  bubbleNumberPrefix: '标号/',
  /** TEXT inside a 标号/N FRAME holding the numeric character. */
  bubbleNumberText: '#Number',
  /** AUTO_LAYOUT FRAME — right column, holds 说明块NN clusters. */
  rightColumnContainer: 'Text',
  /** FRAME name prefix for cluster blocks, e.g. "说明块01". */
  clusterBlockPrefix: '说明块',
  /** TEXT — blue circle number inside a 说明块 (1-based idx). */
  clusterNumberText: 'Number',
  /** TEXT — the cluster main title (plain, no "N." prefix). */
  clusterTitle: '#Title_Main',
  /** TEXT — generic "说明" sub-label. Template carries 2 instances; renderer trims. */
  clusterSubTitle: '#Title',
  /** FRAME name prefix for role-tags frame, e.g. "Frame 427319720". */
  roleTagsFramePrefix: 'Frame 4273',
  /** TEXT — one bullet line. Multiple instances per cluster; clone/trim to match bullet count. */
  clusterBulletText: '正文/规则',
  /** GROUP — optional main-image placeholder inside a cluster block. */
  optionalImagePlaceholder: '配图',
  /** TEXT inside the 配图 GROUP — shows the image description hint for human reference. */
  optionalImagePlaceholderHint: '配图占位文案'
} as const;

/**
 * Role TEXT order inside the role-tags FRAME (name starts with `Frame 4273`).
 * Renderer keeps the TEXTs whose `characters` (including `@` prefix) are
 * present in the cluster's `roles[]`, deletes the rest in a single batch.
 * Horizontal auto-layout auto-collapses the gap.
 *
 * Source: docs/figma-mcp-pitfalls.md → 模板特有规则：角色标签 TEXT 数组
 */
export const ROLE_TEXT_ORDER = [
  '@GUI',
  '@程序',
  '@拼接',
  '@动效',
  '@美术',
  '@策划',
  '@音频'
] as const;

/** Hex colors per role (keys use @-prefixed characters matching the template). */
export const ROLE_COLORS: Record<string, string> = {
  '@GUI': '#FF9154',
  '@程序': '#3ADCFF',
  '@拼接': '#FFEF60',
  '@动效': '#E121FF',
  '@美术': '#FF487C',
  '@策划': '#48FF70',
  '@音频': '#9E7BFF'
};

/** Main image canvas size — 气泡 FRAME and 主图占位 share this rect. */
export const MAIN_IMAGE_SIZE = { width: 1920, height: 1080 } as const;

/**
 * Default 8-bubble grid for sections without user-supplied bubble coords.
 * Coordinates are FRAME-LOCAL inside `气泡` (which equals offsets inside
 * the 1920×1080 main image).
 *
 * Source: docs/figma-mcp-pitfalls.md → 模板特有规则：默认 8 气泡布局
 */
export const DEFAULT_BUBBLE_GRID: Array<{ x: number; y: number }> = [
  { x: 960, y: 60 },
  { x: 960, y: 180 },
  { x: 1700, y: 280 },
  { x: 480, y: 600 },
  { x: 1200, y: 600 },
  { x: 1500, y: 600 },
  { x: 480, y: 800 },
  { x: 480, y: 940 }
];

/** Required font family for every visible TEXT. */
export const FONT_FAMILY = 'Noto Sans SC';
export const FONT_BOLD_STYLE = 'Bold';
export const FONT_REGULAR_STYLE = 'Regular';
