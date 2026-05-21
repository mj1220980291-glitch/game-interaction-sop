/**
 * Markdown → DSL IR parser.
 *
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/dsl-parser/spec.md
 *
 * The parser is intentionally regex / state-machine based. We do NOT pull in a
 * full Markdown AST library — the input shape is constrained (我们自己的文档
 * 模板)，and a tiny parser is easier to reason about for determinism.
 *
 * Output is a plain object matching the DSL schema shape; downstream code
 * still calls `dsl.validate()` on it before trusting it.
 */

export interface ParsedDoc {
  meta: {
    title: string;
    version: string; // Always '1.0.0' for parser-emitted docs (caller can override)
    project: string;
    designUrl: string;
  };
  sections: ParsedSection[];
  designRefs: ParsedDesignRef[];
  screenshots: ParsedScreenshot[];
  warnings: ParseWarning[];
}

export interface ParsedSection {
  index: number;
  title: string;
  bubbles: ParsedBubble[];
}

export interface ParsedBubble {
  id: string;
  text: string;
  // anchor stays undefined — parser cannot infer node IDs without Figma access.
  // Downstream layer (LLM or human) fills in the anchor based on design refs.
}

export interface ParsedDesignRef {
  name: string;
  url: string;
  nodeId: string;
}

export interface ParsedScreenshot {
  sectionIndex: number;
  alt: string;
  src: string;
}

export interface ParseWarning {
  code: string;
  message: string;
  line?: number;
}

export class ParseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly line?: number
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

const FIGMA_LINK_RE =
  /\[([^\]]+)\]\((https?:\/\/(?:www\.)?figma\.com\/design\/[^)]*?node-id=([^)&\s]+)[^)]*)\)/g;
const SECTION_HEADER_RE = /^##\s+(\d+)\.\s+(.+?)\s*$/;
const ANY_HEADER_RE = /^#{1,6}\s+/;
const ANNOTATION_TABLE_HEADER = '主图标注';
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Top-level entry. Returns a partially-formed DSL document plus warnings.
 * Throws ParseError ONLY for hard structural failures (e.g. malformed
 * annotation table). Soft issues become warnings.
 */
export function parseMarkdown(md: string): ParsedDoc {
  const lines = md.split(/\r?\n/);
  const warnings: ParseWarning[] = [];

  const designRefs = extractDesignRefs(md);
  const titleAndProject = extractTitleAndProject(lines);
  const sections = extractSections(lines, warnings);
  const screenshots = extractScreenshots(lines, sections);

  return {
    meta: {
      title: titleAndProject.title,
      version: '1.0.0',
      project: titleAndProject.project,
      designUrl: designRefs[0]?.url ?? ''
    },
    sections,
    designRefs,
    screenshots,
    warnings
  };
}

// --- meta extraction ----------------------------------------------------

function extractTitleAndProject(lines: string[]): { title: string; project: string } {
  // First level-1 heading becomes the title. Project defaults to first token of title.
  let title = '';
  for (const raw of lines) {
    const m = raw.match(/^#\s+(.+?)\s*$/);
    if (m && m[1]) {
      title = m[1].trim();
      break;
    }
  }
  const project = title.split(/\s+/)[0] ?? title;
  return { title, project };
}

// --- design refs --------------------------------------------------------

export function extractDesignRefs(md: string): ParsedDesignRef[] {
  const refs: ParsedDesignRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  // Reset stateful global regex.
  FIGMA_LINK_RE.lastIndex = 0;
  while ((m = FIGMA_LINK_RE.exec(md)) !== null) {
    const [, name, url, rawNode] = m;
    if (!name || !url || !rawNode) continue;
    const nodeId = rawNode.replace(/-/g, ':');
    const key = `${url}|${nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ name: name.trim(), url, nodeId });
  }
  return refs;
}

// --- sections + annotation table ---------------------------------------

function extractSections(lines: string[], warnings: ParseWarning[]): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let inAnnotationTable = false;
  let annotationTableHeaderLine = -1;
  let bubbles: ParsedBubble[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    // Annotation table starts after a "## 主图标注" heading.
    if (line.trim() === `## ${ANNOTATION_TABLE_HEADER}`) {
      inAnnotationTable = true;
      annotationTableHeaderLine = i + 1;
      continue;
    }

    if (inAnnotationTable) {
      if (ANY_HEADER_RE.test(line)) {
        // Annotation block ended; fall through to section parsing.
        inAnnotationTable = false;
      } else if (line.trim().startsWith('|')) {
        const parsedRow = parseTableRow(line);
        if (parsedRow && parsedRow.length >= 3) {
          // First two rows are header + separator; only keep rows where col 0
          // is purely numeric.
          const id = parsedRow[0]?.trim() ?? '';
          const label = parsedRow[1]?.trim() ?? '';
          if (/^\d+$/.test(id)) {
            bubbles.push({ id, text: label });
          }
        } else if (parsedRow && parsedRow.length > 0 && parsedRow.length < 3 && parsedRow[0]?.trim()) {
          // Non-empty row with too few columns → treat as malformed.
          throw new ParseError(
            'PARSE_ANNOTATION_TABLE_MALFORMED',
            `主图标注表格列数不足（期望 ≥3 列，实际 ${parsedRow.length}）`,
            i + 1
          );
        }
        continue;
      }
      // Skip blank lines inside the annotation block.
      if (line.trim() === '') continue;
    }

    const sectionMatch = line.match(SECTION_HEADER_RE);
    if (sectionMatch && sectionMatch[1] && sectionMatch[2]) {
      // Flush current section.
      if (current) sections.push(current);
      const indexNum = Number(sectionMatch[1]);
      const titleText = stripTitlePrefix(sectionMatch[2].trim());
      current = { index: indexNum, title: titleText, bubbles: [] };
    }
  }

  if (current) sections.push(current);

  // Distribute annotation-table bubbles into sections by id ↔ index match.
  if (bubbles.length > 0) {
    distributeBubbles(sections, bubbles, warnings, annotationTableHeaderLine);
  }

  return sections;
}

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  // Strip leading / trailing pipe, split on pipe.
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  // Skip separator rows like |---|---|---|
  if (/^[-:\s|]+$/.test(inner)) return [];
  return inner.split('|').map((c) => c.trim());
}

function distributeBubbles(
  sections: ParsedSection[],
  bubbles: ParsedBubble[],
  warnings: ParseWarning[],
  line: number
): void {
  const byIndex = new Map<number, ParsedSection>();
  for (const s of sections) byIndex.set(s.index, s);

  for (const b of bubbles) {
    const idx = Number(b.id);
    const target = byIndex.get(idx);
    if (target) {
      target.bubbles.push(b);
    } else {
      warnings.push({
        code: 'PARSE_BUBBLE_NO_SECTION',
        message: `标注表条目 id=${b.id} 找不到对应章节 index=${idx}`,
        line
      });
    }
  }
}

// --- screenshots --------------------------------------------------------

function extractScreenshots(
  lines: string[],
  sections: ParsedSection[]
): ParsedScreenshot[] {
  const result: ParsedScreenshot[] = [];
  let currentIndex = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const sectionMatch = line.match(SECTION_HEADER_RE);
    if (sectionMatch && sectionMatch[1]) {
      currentIndex = Number(sectionMatch[1]);
      continue;
    }
    if (currentIndex === 0) continue;

    IMAGE_RE.lastIndex = 0;
    let im: RegExpExecArray | null;
    while ((im = IMAGE_RE.exec(line)) !== null) {
      const [, alt, src] = im;
      if (!src) continue;
      result.push({ sectionIndex: currentIndex, alt: alt ?? '', src });
    }
  }
  // Make sections referenced — even unused, keep param signature.
  void sections;
  return result;
}

// --- title cleanup ------------------------------------------------------

const TITLE_PREFIX_STRIP = /^(?:\d+\s*[.、)]\s*)+/;

function stripTitlePrefix(s: string): string {
  return s.replace(TITLE_PREFIX_STRIP, '').trim();
}
