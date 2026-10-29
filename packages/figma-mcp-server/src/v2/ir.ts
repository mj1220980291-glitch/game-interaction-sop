/**
 * v2 IR (Intermediate Representation) — the parsed, validated form of a
 * v2 Markdown interaction-doc.
 *
 * Spec: skills/game-interaction-sop/references/markdown-v2-spec.md
 *
 * The IR is intentionally flat and dumb. It carries no Figma node IDs,
 * no coordinates, no anchors. Those are the renderer's job.
 */

/** v2 角色名单。任何 @角色 都必须落在这 7 个里面。 */
export const ROLE_NAMES = [
  '程序',
  'GUI',
  '拼接',
  '美术',
  '动效',
  '音频',
  '策划'
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

/** 文件头 4 字段。 */
export interface DocHeader {
  /** # [需求名称] 一级标题 */
  title: string;
  /** 跟进UI */
  owner: string;
  /** 需求组 */
  group: string;
  /** 易协作链接（原文，不做 URL 校验：允许 #待补充） */
  ticketLink: string;
  /** 最后更新时间（原文） */
  lastUpdate: string;
}

/** ## 设计总览 */
export interface DesignOverview {
  /** ### 功能背景 段正文 */
  background: string;
  /** ### 核心交互 段正文 */
  coreInteraction: string;
}

/**
 * 一个簇内的分组单元。
 *
 * 作者在 `### 簇` 内部可以用 `#### 子分类标题` 把 bullets 切成若干组。
 * 没有 `####` 时，parser 自动包出一个 title=null 的默认分组。
 */
export interface BulletGroup {
  /**
   * 子分类标题文本（已 trim）。
   * - 非 null：由作者写的 `#### 小标题` 提供
   * - null   ：隐式默认分组（簇内无任何 `####`，或 `####` 之前有游离 bullets）
   */
  title: string | null;
  /** 归属该分组的 bullet 内容，不含开头 `- ` 标记 */
  bullets: string[];
}

/**
 * 一个 ### 语义簇。属于某个 ## NN. [界面名称] 章节。
 * order = 章节内 1, 2, 3... ，等于该图上对应气泡编号。
 */
export interface SemanticCluster {
  /** 章节内序号，从 1 开始连号 */
  order: number;
  /** ### 标题文本（已 trim） */
  title: string;
  /** @角色 行解析出的角色集合（已去重，按出现顺序） */
  roles: string[];
  /**
   * 分组列表，至少 1 个元素（`C2_ROLE_LINE_MISSING` 的残缺簇除外，为空数组）。
   * - 无 `####` → 1 个 title=null 的默认分组，bullets 即原全部 bullets。
   * - 有 `####` → 按出现顺序排列；若 `####` 之前有游离 bullets，
   *   则额外在 index=0 插入 title=null 的隐式前置分组并 emit W3 警告。
   */
  groups: BulletGroup[];
  /**
   * `groups` 拍平后的全部 bullet，等价于 `groups.flatMap(g => g.bullets)`。
   *
   * 保留此字段的理由：它是「整簇有没有配图 bullet」「整簇一共几条」这类
   * 跨分组判断的天然载体（见 render.ts 的 `needsImage` / 章节级统计），
   * 用它比每处都写一遍 flatMap 更不容易漏。**它是派生字段**，
   * parser 是唯一写入方，任何按分组渲染的逻辑都必须读 `groups`。
   */
  bullets: string[];
}

/**
 * 一个 ## NN. [界面名称] 章节。
 * index = 章节序号（"01", "02", ...），保留为字符串以保留零填充。
 */
export interface InterfaceSection {
  /** "01" / "02" / ... */
  index: string;
  /** 数字形态，1 / 2 / ...，便于排序与校验连续性 */
  indexNum: number;
  /** 界面名称（## NN. 后面的文本，已 trim） */
  name: string;
  /** ### 语义簇列表，至少 1 个 */
  clusters: SemanticCluster[];
  /**
   * 是否为"全局规范"章节（无独立交互图，仅描述组件/规范/汇总等）。
   * 命中规则：`name` 包含关键词 `全局 / 规范 / 组件 / 汇总 / 展示汇总`。
   * renderer 在此类章节上跳过"主图贴图"与"气泡布点"两步，只渲染右栏说明块。
   */
  isGlobalSpec: boolean;
}

/** v2 IR 根。 */
export interface DocIR {
  header: DocHeader;
  overview: DesignOverview;
  sections: InterfaceSection[];
}

// --- 错误码 ----------------------------------------------------------------

/**
 * 强校验错误码。任何一项 → 引擎拒绝写 Figma。
 *
 * 编号约定：
 *   H* — Header  (文件头)
 *   O* — Overview (设计总览)
 *   S* — Section (## 章节级)
 *   C* — Cluster (### 语义簇级)
 *   H_* — sub-Group (#### 簇内子分类级)
 */
export const HARD_ERROR_CODES = {
  H1_HEADER_MISSING: 'V2_H1_HEADER_MISSING',
  H2_TITLE_MISSING: 'V2_H2_TITLE_MISSING',
  O1_OVERVIEW_MISSING: 'V2_O1_OVERVIEW_MISSING',
  O2_OVERVIEW_SUBSECTIONS_INVALID: 'V2_O2_OVERVIEW_SUBSECTIONS_INVALID',
  S1_NO_SECTIONS: 'V2_S1_NO_SECTIONS',
  S2_SECTION_INDEX_NOT_CONTIGUOUS: 'V2_S2_SECTION_INDEX_NOT_CONTIGUOUS',
  C1_NO_CLUSTERS: 'V2_C1_NO_CLUSTERS',
  C2_ROLE_LINE_MISSING: 'V2_C2_ROLE_LINE_MISSING',
  /** G1 — `####` 出现在 `## NN.` 直属内容区（`###` 之前） */
  H_H4_ORPHAN: 'V2_H_H4_ORPHAN',
  /** G2 — `####` 标题显示宽度 > 24 */
  H_GROUP_TITLE_LEN_OVERFLOW: 'V2_H_GROUP_TITLE_LEN_OVERFLOW',
  /** G3 — 同一簇内 `####` 标题重复（大小写不敏感） */
  H_GROUP_TITLE_DUPLICATE: 'V2_H_GROUP_TITLE_DUPLICATE'
} as const;

export type HardErrorCode = (typeof HARD_ERROR_CODES)[keyof typeof HARD_ERROR_CODES];

/**
 * 软约束警告码。引擎照常写 Figma，但提醒用户。
 */
export const SOFT_WARNING_CODES = {
  W1_UNKNOWN_ROLE: 'V2_W1_UNKNOWN_ROLE',
  W2_DEAD_CATEGORY_CLUSTER_NAME: 'V2_W2_DEAD_CATEGORY_CLUSTER_NAME',
  /** W5 — `####` 之前存在游离 bullet，分组与不分组混用 */
  W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS:
    'V2_W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS',
  /** T9 — 同组内状态行之间夹着普通规则 */
  W_STATE_LINES_SCATTERED: 'V2_W_STATE_LINES_SCATTERED',
  /** 状态行仍使用 `状态·` / `状态｜` 前缀 */
  W_LEGACY_STATE_PREFIX: 'V2_W_LEGACY_STATE_PREFIX',
  /** render — 正文字体族没有可用的粗体字重，状态名未加粗 */
  W_STATE_BOLD_UNAVAILABLE: 'V2_W_STATE_BOLD_UNAVAILABLE',
  /** render — assetMap 的键匹配不到任何章节 / 配图 */
  W_ASSET_KEY_UNMATCHED: 'V2_W_ASSET_KEY_UNMATCHED',
  /** render — 单张配图填充失败（源节点不存在、导出失败等），占位保留文案 */
  W_FIGURE_FILL_FAILED: 'V2_W_FIGURE_FILL_FAILED',
  /** render — 带 @职能 的条目找不到对应「职能标记」变体，降级为普通正文 */
  W_ROLE_BLOCK_MISSING: 'V2_W_ROLE_BLOCK_MISSING',
  /** render — 模板没有配图槽（`figure = none`），md 里的配图被丢弃 */
  W_FIGURE_DROPPED: 'V2_W_FIGURE_DROPPED',
  /** render — 模板不支持图上标号（`badgeSlot` 非 container），标号未摆放 */
  W_BADGE_UNPLACED: 'V2_W_BADGE_UNPLACED',  /** 渲染成功但验收截图导出失败（不影响文档本身） */
  W_SCREENSHOT_FAILED: 'V2_W_SCREENSHOT_FAILED',
  /** render — 顶部部件里没有总览槽位，总览内容未写入 */
  W_OVERVIEW_SLOTS_MISSING: 'V2_W_OVERVIEW_SLOTS_MISSING',
  /** 顶部部件缺「文档标题 / 设计师 / 需求组 / 单号 / 更新时间」某个槽位。 */
  W_HEADER_SLOT_MISSING: 'V2_W_HEADER_SLOT_MISSING',
  /** render — 渲染产物与 IR 对不上，对应部分未打标记，之后无法同步 */
  W_STAMP_LAYOUT_MISMATCH: 'V2_W_STAMP_LAYOUT_MISMATCH',
  /** render — 打标记失败，文档可用但无法同步 */
  W_STAMP_FAILED: 'V2_W_STAMP_FAILED',
  /** reconcile — 多个节点携带同一个标记 id（设计师复制了节点），只认第一个 */
  W_DUPLICATE_STAMP: 'V2_W_DUPLICATE_STAMP',
  /** render — 隐藏备用池没删干净（Bridge 超时），节点仍隐藏，不影响成图 */
  W_HIDDEN_POOL_LEFT: 'V2_W_HIDDEN_POOL_LEFT'
} as const;

export type SoftWarningCode =
  (typeof SOFT_WARNING_CODES)[keyof typeof SOFT_WARNING_CODES];

export interface ValidationIssue<C extends string = string> {
  code: C;
  message: string;
  /** 与问题相关的 Markdown 行号（1-based），可选 */
  line?: number;
  /** 上下文，例如哪个章节 / 哪个簇 */
  context?: string;
}

export type HardError = ValidationIssue<HardErrorCode>;
export type SoftWarning = ValidationIssue<SoftWarningCode>;

export interface ParseResult {
  ok: boolean;
  /** 强校验失败时也可能拿到部分 IR，便于 IDE / 错误高亮；但 renderer 不应使用 */
  ir?: DocIR;
  errors: HardError[];
  warnings: SoftWarning[];
}
