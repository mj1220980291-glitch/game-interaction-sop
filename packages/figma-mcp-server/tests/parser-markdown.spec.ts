import { describe, expect, it } from 'vitest';
import {
  ParseError,
  extractDesignRefs,
  parseMarkdown
} from '../src/parser/index.js';

/**
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/dsl-parser/spec.md
 */

const SAMPLE = `# 部从卡牌TIPS 战斗交互文档

跟进UI：荔之
最后更新时间：2026.04.29
Figma交互文档：[部从卡牌TIPS 战斗交互_基于设计稿说明](https://www.figma.com/design/V9nCGuAA0UwxYyI3Mtw86A/M1?node-id=6148-19695)
高保真设计稿：[Slide 16:9 - 7](https://www.figma.com/design/V9nCGuAA0UwxYyI3Mtw86A/M1?node-id=6144-48215)

## 设计总览

略。

## 主图标注

主图使用高保真设计稿 \`6144:48215\`。

| 编号 | 界面信息单元 | 标注位置 |
| --- | --- | --- |
| 1 | 部从选中与入口 | 底部部从卡牌 |
| 2 | 主TIPS固定面板 | 右侧主TIPS整体 |
| 3 | 基础信息与能力描述 | 主TIPS顶部 |

## 01. 部从选中与入口

正文。

![cap1](./assets/01.png)

## 02. 主TIPS固定面板

![cap2](./assets/02.png)

## 03. 基础信息与能力描述
`;

describe('parser/extractDesignRefs', () => {
  it('extracts figma links and converts node-id dash to colon', () => {
    const refs = extractDesignRefs(SAMPLE);
    expect(refs).toHaveLength(2);
    expect(refs[0]?.nodeId).toBe('6148:19695');
    expect(refs[1]?.nodeId).toBe('6144:48215');
  });

  it('ignores non-figma links', () => {
    const md = '[文档](https://example.com) [稿](https://www.figma.com/design/x?node-id=1-2)';
    const refs = extractDesignRefs(md);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.nodeId).toBe('1:2');
  });
});

describe('parser/parseMarkdown — sections', () => {
  it('strips numeric prefix from section title', () => {
    const doc = parseMarkdown(SAMPLE);
    expect(doc.sections.map((s) => s.title)).toEqual([
      '部从选中与入口',
      '主TIPS固定面板',
      '基础信息与能力描述'
    ]);
    expect(doc.sections.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it('keeps title intact when leading token is not a number', () => {
    const md = '## 部从.卡牌\n## 03. 真章节';
    const doc = parseMarkdown('# t\n' + md);
    // First "## 部从.卡牌" lacks numeric index → not picked up by SECTION_HEADER_RE
    // so the only valid section is the second one.
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]?.title).toBe('真章节');
  });
});

describe('parser/parseMarkdown — annotation table', () => {
  it('produces 3 bubbles distributed to the matching sections', () => {
    const doc = parseMarkdown(SAMPLE);
    const bubbles = doc.sections.flatMap((s) => s.bubbles);
    expect(bubbles.map((b) => b.id)).toEqual(['1', '2', '3']);
    expect(doc.sections[0]?.bubbles[0]?.text).toBe('部从选中与入口');
  });

  it('throws PARSE_ANNOTATION_TABLE_MALFORMED for too few columns', () => {
    const md = `# t
## 主图标注

| 编号 | 界面信息单元 |
| --- | --- |
| 1 | 部从 |
`;
    expect(() => parseMarkdown(md)).toThrowError(ParseError);
    try {
      parseMarkdown(md);
    } catch (e) {
      expect((e as ParseError).code).toBe('PARSE_ANNOTATION_TABLE_MALFORMED');
    }
  });

  it('emits PARSE_BUBBLE_NO_SECTION warning for orphan rows', () => {
    const md = `# t
## 主图标注

| 编号 | 界面信息单元 | 标注位置 |
| --- | --- | --- |
| 9 | 不存在的章节 | x |

## 01. 唯一章节
`;
    const doc = parseMarkdown(md);
    expect(doc.warnings.some((w) => w.code === 'PARSE_BUBBLE_NO_SECTION')).toBe(true);
  });
});

describe('parser/parseMarkdown — screenshots', () => {
  it('attaches images to their containing section', () => {
    const doc = parseMarkdown(SAMPLE);
    expect(doc.screenshots).toEqual([
      { sectionIndex: 1, alt: 'cap1', src: './assets/01.png' },
      { sectionIndex: 2, alt: 'cap2', src: './assets/02.png' }
    ]);
  });
});

describe('parser/parseMarkdown — determinism', () => {
  it('produces identical JSON on repeated parses', () => {
    const a = JSON.stringify(parseMarkdown(SAMPLE));
    const b = JSON.stringify(parseMarkdown(SAMPLE));
    expect(a).toBe(b);
  });
});
