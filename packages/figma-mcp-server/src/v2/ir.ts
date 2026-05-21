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
   * 该簇下的 bullet 内容（不包含开头的 `- ` 标记）。
   * `配图：xxx` 也作为一条普通 bullet，由 renderer 检测前缀决定是否走配图槽位。
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
 */
export const HARD_ERROR_CODES = {
  H1_HEADER_MISSING: 'V2_H1_HEADER_MISSING',
  H2_TITLE_MISSING: 'V2_H2_TITLE_MISSING',
  O1_OVERVIEW_MISSING: 'V2_O1_OVERVIEW_MISSING',
  O2_OVERVIEW_SUBSECTIONS_INVALID: 'V2_O2_OVERVIEW_SUBSECTIONS_INVALID',
  S1_NO_SECTIONS: 'V2_S1_NO_SECTIONS',
  S2_SECTION_INDEX_NOT_CONTIGUOUS: 'V2_S2_SECTION_INDEX_NOT_CONTIGUOUS',
  C1_NO_CLUSTERS: 'V2_C1_NO_CLUSTERS',
  C2_ROLE_LINE_MISSING: 'V2_C2_ROLE_LINE_MISSING'
} as const;

export type HardErrorCode = (typeof HARD_ERROR_CODES)[keyof typeof HARD_ERROR_CODES];

/**
 * 软约束警告码。引擎照常写 Figma，但提醒用户。
 */
export const SOFT_WARNING_CODES = {
  W1_UNKNOWN_ROLE: 'V2_W1_UNKNOWN_ROLE',
  W2_DEAD_CATEGORY_CLUSTER_NAME: 'V2_W2_DEAD_CATEGORY_CLUSTER_NAME'
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
