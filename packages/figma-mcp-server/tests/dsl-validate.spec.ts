import { describe, expect, it } from 'vitest';
import { ErrorCodes, validate } from '../src/dsl/index.js';

/**
 * Mirrors scenarios in:
 *   openspec/changes/build-figma-interaction-doc-engine/specs/interaction-doc-dsl/spec.md
 */

const VALID_DOC = `
meta:
  title: 部从卡牌 TIPS
  version: 1.0.0
  project: kk8
  designUrl: https://www.figma.com/design/abc?node-id=1-2
sections:
  - index: 1
    title: 部从选中
    bubbles:
      - id: "1"
        text: 点击进入选中
        layer: overlay
        anchor:
          nodeId: "6144:48215"
designRefs:
  - name: 主图
    url: https://www.figma.com/design/abc?node-id=6144-48215
    nodeId: "6144:48215"
screenshots:
  - sectionIndex: 1
    alt: cap1
    src: ./assets/01.png
`.trim();

describe('dsl/validate — happy path', () => {
  it('accepts a fully populated DSL', () => {
    const r = validate(VALID_DOC);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ir.meta.title).toBe('部从卡牌 TIPS');
      expect(r.ir.sections).toHaveLength(1);
      expect(r.ir.sections[0]?.bubbles[0]?.layer).toBe('overlay');
    }
  });
});

describe('dsl/validate — DSL_MISSING_META', () => {
  it('flags missing meta block with line hint', () => {
    const yaml = `
sections:
  - index: 1
    title: 部从选中
    bubbles: []
`.trim();
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe(ErrorCodes.DSL_MISSING_META);
      expect(r.errors[0]?.hint).toContain('meta');
    }
  });

  it('uses line=1 fallback when meta literal does not appear in source', () => {
    // YAML where the root has no "meta" key at all, just other text.
    const r = validate('foo: bar\nbaz: qux\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe(ErrorCodes.DSL_MISSING_META);
      expect(r.errors[0]?.line).toBe(1);
    }
  });
});

describe('dsl/validate — DSL_META_VERSION_INVALID', () => {
  it('rejects two-segment versions', () => {
    const yaml = VALID_DOC.replace('version: 1.0.0', "version: '1.0'");
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_META_VERSION_INVALID)).toBe(true);
    }
  });
});

describe('dsl/validate — DSL_META_URL_INSECURE', () => {
  it('rejects http URLs', () => {
    const r = validate(VALID_DOC.replace('https://www.figma.com', 'http://www.figma.com'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_META_URL_INSECURE)).toBe(true);
    }
  });
});

describe('dsl/validate — DSL_SECTION_TITLE_HAS_PREFIX', () => {
  it.each([
    ['01. 部从选中'],
    ['3、部从选中'],
    ['# 部从选中']
  ])('rejects title %s', (title) => {
    // Wrap in quotes so YAML does not interpret `#` as comment / `01` as int.
    const yaml = VALID_DOC.replace('title: 部从选中', `title: "${title}"`);
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_SECTION_TITLE_HAS_PREFIX)).toBe(true);
    }
  });
});

describe('dsl/validate — DSL_SECTION_INDEX_DUPLICATE', () => {
  it('flags duplicate index across sections', () => {
    const yaml = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections:
  - index: 1
    title: A
    bubbles: []
  - index: 1
    title: B
    bubbles: []
`.trim();
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_SECTION_INDEX_DUPLICATE)).toBe(true);
    }
  });
});

describe('dsl/validate — DSL_ANCHOR_AMBIGUOUS', () => {
  it('rejects bubbles with both nodeId and absXY', () => {
    const yaml = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections:
  - index: 1
    title: A
    bubbles:
      - id: "1"
        text: t
        layer: overlay
        anchor:
          nodeId: "1:1"
          absXY: [10, 20]
`.trim();
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_ANCHOR_AMBIGUOUS)).toBe(true);
    }
  });
});

describe('dsl/validate — DSL_BUBBLE_LAYER_MISSING / INVALID', () => {
  it('flags missing layer', () => {
    const yaml = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections:
  - index: 1
    title: A
    bubbles:
      - id: "1"
        text: t
        anchor:
          nodeId: "1:1"
`.trim();
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_BUBBLE_LAYER_MISSING)).toBe(true);
    }
  });

  it('flags invalid layer value', () => {
    const yaml = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections:
  - index: 1
    title: A
    bubbles:
      - id: "1"
        text: t
        layer: below
        anchor:
          nodeId: "1:1"
`.trim();
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_BUBBLE_LAYER_INVALID)).toBe(true);
    }
  });
});

describe('dsl/validate — error object structure', () => {
  it('every error has code and message; code in whitelist', () => {
    const r = validate('not: yaml: at: all:');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      for (const e of r.errors) {
        expect(typeof e.code).toBe('string');
        expect(typeof e.message).toBe('string');
        expect(Object.values(ErrorCodes)).toContain(e.code);
      }
    }
  });

  it('YAML parse error includes line', () => {
    const broken = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections:
  - index: 1
    title: A
    bubbles:
      - id: "1
`.trim();
    const r = validate(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe(ErrorCodes.DSL_YAML_PARSE_ERROR);
      expect(typeof r.errors[0]?.line).toBe('number');
    }
  });

  it('rejects array root with DSL_SCHEMA_VIOLATION', () => {
    const r = validate('- foo\n- bar\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe(ErrorCodes.DSL_SCHEMA_VIOLATION);
    }
  });

  it('rejects scalar root with DSL_SCHEMA_VIOLATION', () => {
    const r = validate('"just a string"');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe(ErrorCodes.DSL_SCHEMA_VIOLATION);
    }
  });

  it('flags missing anchor with DSL_ANCHOR_MISSING', () => {
    const yaml = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections:
  - index: 1
    title: A
    bubbles:
      - id: "1"
        text: t
        layer: overlay
`.trim();
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_ANCHOR_MISSING)).toBe(true);
    }
  });

  it('flags empty anchor object with DSL_ANCHOR_MISSING', () => {
    const yaml = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections:
  - index: 1
    title: A
    bubbles:
      - id: "1"
        text: t
        layer: overlay
        anchor: {}
`.trim();
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === ErrorCodes.DSL_ANCHOR_MISSING)).toBe(true);
    }
  });

  it('falls back to DSL_SCHEMA_VIOLATION for unrelated schema issues', () => {
    // sections: empty array → violates min(1)
    const yaml = `
meta:
  title: t
  version: 1.0.0
  project: p
  designUrl: https://x.com/y
sections: []
`.trim();
    const r = validate(yaml);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe(ErrorCodes.DSL_SCHEMA_VIOLATION);
    }
  });
});
