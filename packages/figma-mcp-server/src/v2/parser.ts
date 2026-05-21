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
      out.push({ order: i + 1, title: b.title, roles: [], bullets: [] });
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

    // W2: dead-category cluster name
    if (DEAD_CATEGORY_NAMES.has(b.title)) {
      warnings.push({
        code: SOFT_WARNING_CODES.W2_DEAD_CATEGORY_CLUSTER_NAME,
        message: `\`### ${b.title}\` 是 v1 死分类，建议改用语义动词短语（如"入口规则"/"显示位置与切换"等）`,
        line: absLine,
        context: b.title
      });
    }

    // bullets: 跳过角色行后的所有 `- xxx`
    const bullets: string[] = [];
    let pastRoleLine = false;
    for (const raw of b.bodyLines) {
      const t = raw;
      if (!pastRoleLine) {
        if (t.trim().length > 0 && t.trim() === firstNonEmpty.trim()) {
          pastRoleLine = true;
          continue;
        }
        continue;
      }
      const m = t.match(/^\s*[-*]\s+(.*)$/);
      if (m) bullets.push((m[1] ?? '').trim());
      // 非 bullet 的正文行（说明性段落）也保留为 bullet，以避免内容丢失
      else if (t.trim().length > 0) bullets.push(t.trim());
    }

    out.push({
      order: i + 1,
      title: b.title,
      roles,
      bullets
    });
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
