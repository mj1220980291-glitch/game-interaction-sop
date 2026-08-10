/**
 * v2 Markdown parser + validator.
 *
 * Single entry point: `parseV2(markdown) -> ParseResult`.
 * Pure function, no IO.
 *
 * Spec:
 *   skills/game-interaction-sop/references/markdown-v2-spec.md
 *
 * Strategy:
 *   1. Split into lines, normalize CR/LF.
 *   2. Walk linearly, accumulating into a draft IR.
 *   3. Run hard validations on the draft → errors[].
 *   4. Run soft validations → warnings[].
 *   5. Return { ok, ir, errors, warnings }.
 *
 * Hard-error codes are the contract with the renderer; do not change them
 * without bumping a version marker in markdown-v2-spec.md.
 */

import {
  HARD_ERROR_CODES,
  ROLE_NAMES,
  SOFT_WARNING_CODES,
  type DocHeader,
  type DocIR,
  type DesignOverview,
  type HardError,
  type InterfaceSection,
  type ParseResult,
  type SemanticCluster,
  type BulletGroup,
  type SoftWarning
} from './ir.js';

// --- Header field labels -------------------------------------------------

const HEADER_FIELDS: Array<{ key: keyof Omit<DocHeader, 'title'>; label: string }> = [
  { key: 'owner', label: '跟进UI' },
  { key: 'group', label: '需求组' },
  { key: 'ticketLink', label: '易协作链接' },
  { key: 'lastUpdate', label: '最后更新时间' }
];

// --- Dead-category cluster names (W2) ------------------------------------

const DEAD_CATEGORY_NAMES = new Set([
  '功能定位',
  '显示规则',
  '操作规则',
  '反馈表现',
  '异常与边界',
  '配图说明',
  '注意事项',
  '待确认'
]);

// --- Section naming keywords (S3) ----------------------------------------
//
// 由 OpenSpec change `add-classify-prephase-for-markdown` 引入：
//   - INTERFACE_KEYWORDS：章节名包含其中任一即满足 S3（可识别为关键界面 / UI 元素）
//   - SECTION_ALLOWLIST_KEYWORDS：S3 的全局规范白名单（无独立 UI 主图也合法）
//
// 注意 `SECTION_ALLOWLIST_KEYWORDS` 与 `isGlobalSpecName` 的 4 词列表**不同**：
// 白名单更宽（加了"流程/结算"），用于"S3 通过 + 仍按普通章节渲染（要主图）"；
// `isGlobalSpec` 决定 renderer 是否跳过主图，仍只识别 4 个原始规范词。

const INTERFACE_KEYWORDS: readonly string[] = [
  '界面',
  '面板',
  '页',
  '窗',
  '卡',
  '弹窗',
  '弹层',
  '区',
  '条',
  '栏',
  '区域',
  '版',
  '入口',
  '反馈',
  '场景'
];

const SECTION_ALLOWLIST_KEYWORDS: readonly string[] = [
  '全局',
  '规范',
  '组件',
  '汇总',
  '流程',
  '结算'
];

// --- Cluster naming forbidden suffixes (W6) ------------------------------
//
// 由 OpenSpec change `add-classify-prephase-for-markdown` 引入：
// `### 簇名` 与 `#### 子分类名` 以这些后缀结尾时 emit `W_CLUSTER_NAME_LOOKS_RULE`。
// 推荐改为名词性界面信息块名（"基础信息" / "出售按钮"）或行为单元短语
// （"hover 行为" / "折叠流程"）。
const RULE_NAME_FORBIDDEN_SUFFIXES: readonly string[] = [
  '时机',
  '规则',
  '层级',
  '限制',
  '边界',
  '兼容',
  '表现'
];

// --- Public entry --------------------------------------------------------


export function parseV2(markdown: string): ParseResult {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const errors: HardError[] = [];
  const warnings: SoftWarning[] = [];

  // 1) Header
  const header = parseHeader(lines, errors);

  // 2) Overview
  const overview = parseOverview(lines, errors);

  // 3) Sections
  const sections = parseSections(lines, errors, warnings);

  const ir: DocIR | undefined =
    header && overview && sections
      ? { header, overview, sections }
      : undefined;

  return {
    ok: errors.length === 0,
    ir,
    errors,
    warnings
  };
}

// --- Header --------------------------------------------------------------

function parseHeader(lines: string[], errors: HardError[]): DocHeader | undefined {
  // 首个非空行必须是 # [需求名称]
  let titleLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const t = raw.trim();
    if (t.length === 0) continue;
    if (t.startsWith('## ') || t.startsWith('### ')) break; // hit a sub-heading first
    if (t.startsWith('# ')) {
      titleLineIdx = i;
      break;
    }
    break; // first non-empty line is not # → no title
  }
  if (titleLineIdx === -1) {
    errors.push({
      code: HARD_ERROR_CODES.H2_TITLE_MISSING,
      message: '文档必须以一级标题 `# [需求名称]` 开头'
    });
    return undefined;
  }

  const titleRaw = lines[titleLineIdx] ?? '';
  const title = titleRaw.trim().replace(/^#\s+/, '').trim();
  if (title.length === 0) {
    errors.push({
      code: HARD_ERROR_CODES.H2_TITLE_MISSING,
      message: '一级标题不能为空',
      line: titleLineIdx + 1
    });
    return undefined;
  }

  // 在 title 行之后、`## ` 之前的范围内查找 4 个字段
  const stopIdx = findNextH2(lines, titleLineIdx + 1);
  const headerScope = lines.slice(titleLineIdx + 1, stopIdx);

  const captured: Partial<DocHeader> = { title };
  let missingAny = false;
  for (const { key, label } of HEADER_FIELDS) {
    const value = findHeaderField(headerScope, label);
    if (value === undefined) {
      errors.push({
        code: HARD_ERROR_CODES.H1_HEADER_MISSING,
        message: `文件头缺失字段：${label}`,
        line: titleLineIdx + 1
      });
      missingAny = true;
    } else {
      captured[key] = value;
    }
  }
  if (missingAny) return undefined;
  return captured as DocHeader;
}

function findNextH2(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (/^##\s+/.test(raw)) return i;
  }
  return lines.length;
}

/**
 * 在给定的 header 范围内找形如 `Label：value` 或 `Label: value` 的字段。
 * 标签后允许全角冒号或半角冒号，前后允许空白。
 */
function findHeaderField(scope: string[], label: string): string | undefined {
  // Escape regex special chars in label (none expected in our 4 labels but be safe).
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}\\s*[：:]\\s*(.*)$`);
  for (const raw of scope) {
    const t = (raw ?? '').trim();
    const m = t.match(re);
    if (m) {
      const v = (m[1] ?? '').trim();
      return v.length > 0 ? v : undefined;
    }
  }
  return undefined;
}

// --- Overview ------------------------------------------------------------

function parseOverview(
  lines: string[],
  errors: HardError[]
): DesignOverview | undefined {
  // Find `## 设计总览` exactly.
  let overviewIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '## 设计总览') {
      overviewIdx = i;
      break;
    }
  }
  if (overviewIdx === -1) {
    errors.push({
      code: HARD_ERROR_CODES.O1_OVERVIEW_MISSING,
      message: '缺少 `## 设计总览` 章节'
    });
    return undefined;
  }

  const stopIdx = findNextH2(lines, overviewIdx + 1);
  const scope = lines.slice(overviewIdx + 1, stopIdx);

  // 在 scope 内必须正好有 ### 功能背景 + ### 核心交互 两块（顺序固定）
  const subs = collectThreeHashSubsections(scope);
  const titles = subs.map((s) => s.title);
  if (
    subs.length !== 2 ||
    titles[0] !== '功能背景' ||
    titles[1] !== '核心交互'
  ) {
    errors.push({
      code: HARD_ERROR_CODES.O2_OVERVIEW_SUBSECTIONS_INVALID,
      message:
        '`## 设计总览` 下必须正好包含 `### 功能背景` + `### 核心交互` 两个三级标题（顺序固定）',
      line: overviewIdx + 1
    });
    return undefined;
  }

  const sub0 = subs[0];
  const sub1 = subs[1];
  if (!sub0 || !sub1) return undefined; // unreachable; appease TS

  return {
    background: sub0.body.trim(),
    coreInteraction: sub1.body.trim()
  };
}

interface H3Block {
  title: string;
  /** 标题行后到下一个 ### 或末尾之间的所有原始行（含空行，不含标题本身） */
  bodyLines: string[];
  /** 拼接后的纯文本 */
  body: string;
  /** 标题行号（1-based），用于报错 */
  line: number;
}

function collectThreeHashSubsections(scope: string[]): H3Block[] {
  const blocks: H3Block[] = [];
  let cur: H3Block | null = null;
  for (let i = 0; i < scope.length; i++) {
    const t = scope[i] ?? '';
    const m = t.match(/^###\s+(.+)$/);
    if (m) {
      if (cur) {
        cur.body = cur.bodyLines.join('\n').trim();
        blocks.push(cur);
      }
      cur = {
        title: (m[1] ?? '').trim(),
        bodyLines: [],
        body: '',
        line: i + 1
      };
    } else if (cur) {
      cur.bodyLines.push(t);
    }
    // Lines before any ### inside scope are ignored (e.g., blank lines after `## 设计总览`).
  }
  if (cur) {
    cur.body = cur.bodyLines.join('\n').trim();
    blocks.push(cur);
  }
  return blocks;
}

// --- Sections ------------------------------------------------------------

const SECTION_HEAD_RE = /^##\s+(\d{2})\.\s*(.+)$/;

function parseSections(
  lines: string[],
  errors: HardError[],
  warnings: SoftWarning[]
): InterfaceSection[] | undefined {
  // Collect all `## NN. xxx` heading positions.
  const sectionStarts: Array<{ idx: number; numStr: string; name: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const m = raw.match(SECTION_HEAD_RE);
    if (m) {
      sectionStarts.push({
        idx: i,
        numStr: m[1] ?? '',
        name: (m[2] ?? '').trim()
      });
    }
  }

  if (sectionStarts.length === 0) {
    errors.push({
      code: HARD_ERROR_CODES.S1_NO_SECTIONS,
      message: '至少需要一个 `## NN. [界面名称]` 章节'
    });
    return undefined;
  }

  // Validate contiguous numbering 01, 02, 03, ...
  let contiguous = true;
  for (let i = 0; i < sectionStarts.length; i++) {
    const expected = i + 1;
    const start = sectionStarts[i];
    if (!start) continue;
    const actual = parseInt(start.numStr, 10);
    if (actual !== expected) {
      errors.push({
        code: HARD_ERROR_CODES.S2_SECTION_INDEX_NOT_CONTIGUOUS,
        message: `章节序号必须从 01 开始连续递增；第 ${
          i + 1
        } 个章节应为 \`## ${pad2(expected)}.\`，实际为 \`## ${start.numStr}.\``,
        line: start.idx + 1
      });
      contiguous = false;
    }
  }
  if (!contiguous) return undefined;

  const sections: InterfaceSection[] = [];
  for (let i = 0; i < sectionStarts.length; i++) {
    const cur = sectionStarts[i];
    if (!cur) continue;
    const nxt = sectionStarts[i + 1];
    const start = cur.idx;
    const stop = nxt ? nxt.idx : lines.length;
    const scope = lines.slice(start + 1, stop);

    const clusters = parseClusters(scope, start + 1, errors, warnings);
    if (clusters.length === 0) {
      errors.push({
        code: HARD_ERROR_CODES.C1_NO_CLUSTERS,
        message: `\`## ${cur.numStr}. ${cur.name}\` 至少需要 1 个 \`###\` 语义簇`,
        line: start + 1
      });
      continue;
    }

    // S3 check: section name must hint a real UI surface (or be allowlisted
    // as a global-spec chapter). Catches "stage-style" naming like
    // "准备环节" / "选择环节" / "卡牌交换环节" that group rules by time/process
    // instead of by interface.
    if (!isSectionNameAcceptable(cur.name)) {
      errors.push({
        code: HARD_ERROR_CODES.H_SECTION_NOT_INTERFACE,
        message:
          `\`## ${cur.numStr}. ${cur.name}\` 章节名应含界面关键词或属于全局规范白名单；` +
          `当前命名疑似按"流程时段"切分（如"xx 环节"）。\n` +
          `界面关键词：${INTERFACE_KEYWORDS.join(' / ')}\n` +
          `全局规范白名单：${SECTION_ALLOWLIST_KEYWORDS.join(' / ')}\n` +
          `建议先按"界面/场景态 → 功能模块"重做分类决策（见 phase2-markdown.md Step 0）。`,
        line: start + 1,
        context: cur.name
      });
      continue;
    }

    sections.push({
      index: cur.numStr,
      indexNum: parseInt(cur.numStr, 10),
      name: cur.name,
      clusters,
      isGlobalSpec: isGlobalSpecName(cur.name)
    });
  }

  return sections;
}

/**
 * S3 (add-classify-prephase-for-markdown):
 * 章节名只要含 `INTERFACE_KEYWORDS` 或 `SECTION_ALLOWLIST_KEYWORDS` 任一即合法。
 */
function isSectionNameAcceptable(name: string): boolean {
  for (const kw of INTERFACE_KEYWORDS) {
    if (name.includes(kw)) return true;
  }
  for (const kw of SECTION_ALLOWLIST_KEYWORDS) {
    if (name.includes(kw)) return true;
  }
  return false;
}

/**
 * 判定一个章节是否为"全局规范"章节。命中任一关键词即视为 true。
 *
 * 触发词含义：
 *   - 全局 / 规范 / 组件 / 汇总：通常对应无独立主图的规范条款
 *     （例如"等级数字全局展示"、"字体规范"、"按钮组件汇总"）。
 *
 * 设计意图：让 renderer 在此类章节上跳过"主图贴图"与"气泡布点"两步，
 * 只渲染右栏说明块；避免模板里残留的空白主图占位与默认网格气泡打扰阅读。
 */
function isGlobalSpecName(name: string): boolean {
  const keywords = ['全局', '规范', '组件', '汇总'];
  return keywords.some((k) => name.includes(k));
}

function parseClusters(
  scope: string[],
  scopeStartLineNo: number,
  errors: HardError[],
  warnings: SoftWarning[]
): SemanticCluster[] {
  // First: guard against orphan #### that appear before any ### in the scope.
  // (#### inside a cluster body is fine — handled below.)
  for (let i = 0; i < scope.length; i++) {
    const t = (scope[i] ?? '').trim();
    if (/^###\s+/.test(t)) break; // first ### found — #### after here is OK
    if (/^####\s+/.test(t)) {
      errors.push({
        code: HARD_ERROR_CODES.H_H4_ORPHAN,
        message: '`####` 子分类标题必须出现在 `### 语义簇` 内部，不能在章节顶层',
        line: scopeStartLineNo + i + 1
      });
    }
  }

  const blocks = collectThreeHashSubsections(scope);
  const out: SemanticCluster[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;
    const absLine = scopeStartLineNo + b.line; // approximate

    // 第一行非空必须是 @角色...
    const firstNonEmpty = b.bodyLines.find((l) => l.trim().length > 0);
    if (!firstNonEmpty || !/^@\S/.test(firstNonEmpty.trim())) {
      errors.push({
        code: HARD_ERROR_CODES.C2_ROLE_LINE_MISSING,
        message: `\`### ${b.title}\` 下方第一行必须是 \`@角色1 @角色2 ...\``,
        line: absLine,
        context: b.title
      });
      out.push({ order: i + 1, title: b.title, roles: [], groups: [] });
      continue;
    }

    const roles = parseRoleLine(firstNonEmpty);
    // W1: unknown role
    for (const r of roles) {
      if (!ROLE_NAMES.includes(r as (typeof ROLE_NAMES)[number])) {
        warnings.push({
          code: SOFT_WARNING_CODES.W1_UNKNOWN_ROLE,
          message: `\`@${r}\` 不在 7 角色名单内（程序/GUI/拼接/美术/动效/音频/策划）`,
          line: absLine,
          context: b.title
        });
      }
    }

    // W2: dead-category cluster name (revised by add-classify-prephase-for-markdown).
    // W6: rule-property suffix. 命中两者只 emit 一次（W2 优先，更严格）。
    if (DEAD_CATEGORY_NAMES.has(b.title) || endsWithAny(b.title, DEAD_CATEGORY_NAMES)) {
      warnings.push({
        code: SOFT_WARNING_CODES.W2_DEAD_CATEGORY_CLUSTER_NAME,
        message:
          `\`### ${b.title}\` 是死分类命名（把多个功能的同类规则拍平到一起）。\n` +
          `建议改用界面上可识别的功能模块 / 信息块名词（如"基础信息"、"出售按钮"、"hover 触发区"）。`,
        line: absLine,
        context: b.title
      });
    } else if (endsWithAny(b.title, RULE_NAME_FORBIDDEN_SUFFIXES)) {
      warnings.push({
        code: SOFT_WARNING_CODES.W_CLUSTER_NAME_LOOKS_RULE,
        message:
          `\`### ${b.title}\` 以规则属性后缀结尾（${RULE_NAME_FORBIDDEN_SUFFIXES.join(' / ')}）。\n` +
          `建议改成名词性命名（如 "xxx 区" / "xxx 按钮"）或行为单元（"xxx 行为" / "xxx 流程"）。`,
        line: absLine,
        context: b.title
      });
    }

    // --- 解析 groups（Tasks 2.2-2.5） ---
    const groups = parseClusterGroups(b.bodyLines, firstNonEmpty, absLine, b.title, errors, warnings);

    out.push({
      order: i + 1,
      title: b.title,
      roles,
      groups
    });
  }

  return out;
}

// Max group title display-width: 24 (≈ 12 Chinese chars).
const GROUP_TITLE_MAX_ASCII = 24;

/** 计算字符串的"显示宽度"：CJK 字符宽度 2，其他宽度 1。用于分组标题长度校验。 */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs, fullwidth, Hangul, etc.
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3000 && cp <= 0x9fff) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xac00 && cp <= 0xd7af)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

/**
 * 从簇的 bodyLines 里解析分组。
 *
 * bodyLines 格式（角色行已在第一行，其余是 bullets 和可选的 #### 行）：
 *
 *   @程序 @GUI
 *
 *   游离bullet1          ← 在任何 #### 之前出现 → 进 title=null 默认 group
 *
 *   #### 基础信息
 *   - bullet1
 *
 *   #### 升级反馈
 *   - bullet2
 */
function parseClusterGroups(
  bodyLines: string[],
  roleLineText: string,
  absLineHint: number,
  clusterTitle: string,
  errors: HardError[],
  warnings: SoftWarning[]
): BulletGroup[] {
  // --- Phase 1: skip past the @role line ---
  let pastRoleLine = false;
  const afterRoleLines: string[] = [];
  for (const raw of bodyLines) {
    if (!pastRoleLine) {
      if (raw.trim().length > 0 && raw.trim() === roleLineText.trim()) {
        pastRoleLine = true;
      }
      continue;
    }
    afterRoleLines.push(raw);
  }

  // --- Phase 2: split into groups by #### anchors ---
  interface RawGroup {
    title: string | null;
    lines: string[];
  }
  const rawGroups: RawGroup[] = [];
  let currentGroup: RawGroup = { title: null, lines: [] };

  for (const raw of afterRoleLines) {
    const t = raw.trim();
    const h4 = t.match(/^####\s+(.+)$/);
    if (h4) {
      // Start a new named group; flush current.
      rawGroups.push(currentGroup);
      currentGroup = { title: (h4[1] ?? '').trim(), lines: [] };
    } else {
      currentGroup.lines.push(raw);
    }
  }
  rawGroups.push(currentGroup); // flush last

  // rawGroups[0] is the implicit group (title=null, might be empty).
  // Named groups are rawGroups[1..].

  const hasH4 = rawGroups.length > 1;
  const freeBullets = extractBullets(rawGroups[0]?.lines ?? []);
  const hasFree = freeBullets.length > 0;

  // W3: mixed free bullets + named groups
  if (hasH4 && hasFree) {
    warnings.push({
      code: SOFT_WARNING_CODES.W3_CLUSTER_MIXED_FREE_BULLETS_AND_GROUPS,
      message: `\`### ${clusterTitle}\` 中 \`####\` 之前有游离 bullet，建议要么全分组、要么全不分组`,
      line: absLineHint,
      context: clusterTitle
    });
  }

  // Build final groups list
  const groups: BulletGroup[] = [];

  if (!hasH4) {
    // No #### at all → single default group (向后兼容路径)
    groups.push({ title: null, bullets: freeBullets });
  } else {
    // 有 #### 分组
    if (hasFree) {
      // 游离 bullets → title=null 默认组放最前
      groups.push({ title: null, bullets: freeBullets });
    }
    // Named groups
    const seenTitles = new Set<string>();
    for (const rg of rawGroups.slice(1)) {
      if (!rg) continue;
      const gt = rg.title!; // always non-null for index ≥ 1

      // H3: title length
      if (displayWidth(gt) > GROUP_TITLE_MAX_ASCII) {
        errors.push({
          code: HARD_ERROR_CODES.H_GROUP_TITLE_LEN_OVERFLOW,
          message: `\`#### ${gt}\` 子分类标题过长（显示宽度 ${displayWidth(gt)} > ${GROUP_TITLE_MAX_ASCII}），请缩短`,
          line: absLineHint,
          context: clusterTitle
        });
      }

      // H4: duplicate title within same cluster
      const normalised = gt.toLowerCase();
      if (seenTitles.has(normalised)) {
        errors.push({
          code: HARD_ERROR_CODES.H_GROUP_TITLE_DUPLICATE,
          message: `\`### ${clusterTitle}\` 中出现重复的子分类标题 \`#### ${gt}\``,
          line: absLineHint,
          context: clusterTitle
        });
      }
      seenTitles.add(normalised);

      // W2 / W6: dead-category & rule-property suffix also apply to #### sub-groups.
      // Same precedence as on ###: W2 wins over W6.
      if (DEAD_CATEGORY_NAMES.has(gt) || endsWithAny(gt, DEAD_CATEGORY_NAMES)) {
        warnings.push({
          code: SOFT_WARNING_CODES.W2_DEAD_CATEGORY_CLUSTER_NAME,
          message:
            `\`#### ${gt}\` 子分类是死分类命名。\n` +
            `建议改用维度切分命名（如"基础信息" / "升级反馈" / "未锁定态" / "已锁定态"）。`,
          line: absLineHint,
          context: `${clusterTitle} > ${gt}`
        });
      } else if (endsWithAny(gt, RULE_NAME_FORBIDDEN_SUFFIXES)) {
        warnings.push({
          code: SOFT_WARNING_CODES.W_CLUSTER_NAME_LOOKS_RULE,
          message:
            `\`#### ${gt}\` 子分类以规则属性后缀结尾（${RULE_NAME_FORBIDDEN_SUFFIXES.join(' / ')}）。\n` +
            `建议改成名词性维度切分名（"基础信息" / "升级反馈" / "默认态" 等）。`,
          line: absLineHint,
          context: `${clusterTitle} > ${gt}`
        });
      }

      groups.push({ title: gt, bullets: extractBullets(rg.lines) });
    }
  }

  return groups;
}

/** 从行数组里提取 bullet 内容（去掉 `- ` 前缀）；非 bullet 的正文行也保留。 */
function extractBullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (t.length === 0) continue;
    const m = t.match(/^\s*[-*]\s+(.*)$/);
    if (m) out.push((m[1] ?? '').trim());
    else out.push(t);
  }
  return out;
}

/**
 * 解析 `@程序 @GUI @拼接` 这种行，按出现顺序去重，去掉 `@` 前缀。
 * 容错：允许多余空格、tab。
 */
function parseRoleLine(line: string): string[] {
  const tokens = line.trim().split(/\s+/);
  const roles: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    if (!tok.startsWith('@')) continue;
    const name = tok.slice(1).trim();
    if (name.length === 0) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    roles.push(name);
  }
  return roles;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 任一后缀命中（区分大小写，按 endsWith 判定）。
 * 接受 `readonly string[]` 或 `Set<string>` 作为词表。
 */
function endsWithAny(name: string, suffixes: readonly string[] | Set<string>): boolean {
  const iter = suffixes instanceof Set ? Array.from(suffixes) : suffixes;
  for (const sfx of iter) {
    if (name.endsWith(sfx)) return true;
  }
  return false;
}
