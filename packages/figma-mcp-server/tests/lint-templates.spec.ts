import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/figma-executor/spec.md
 *
 * Z-order rules (verified via real Figma plugin runtime smoke test):
 *   - Design canvas template (cloneAndPlace) MUST use insertChild(0, ...).
 *   - Overlay template (insertOverlay) MUST use appendChild(...).
 * Earlier versions had these inverted, leading to the "bubbles invisible"
 * bug. This lint test guards the polarity at file-level so regressions
 * cannot land silently.
 */

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const TEMPLATES_DIR = resolve(__dirname, '..', 'src', 'templates');

function listTemplateFiles(): { name: string; src: string; path: string }[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => f !== 'index.ts' && !f.startsWith('_'))
    .map((f) => ({
      name: f,
      path: join(TEMPLATES_DIR, f),
      src: readFileSync(join(TEMPLATES_DIR, f), 'utf8')
    }));
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('templates lint — z-order polarity', () => {
  const files = listTemplateFiles();

  it('finds at least one template file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    const rel = `templates/${f.name}`;

    if (f.name === 'cloneAndPlace.ts') {
      it(`${rel} must call insertChild(0, ...) for design layer`, () => {
        const code = stripComments(f.src);
        expect(code.includes('insertChild(0,')).toBe(true);
      });
    }

    if (f.name === 'insertOverlay.ts') {
      it(`${rel} must call appendChild(...) for overlays (NOT insertChild(0))`, () => {
        const code = stripComments(f.src);
        expect(code.includes('appendChild(')).toBe(true);
        expect(code.includes('insertChild(0,')).toBe(false);
      });
    }

    it(`${rel} loads via require(...) free path (no dynamic eval risks)`, () => {
      // Sanity check: templates should never use eval / new Function.
      const code = stripComments(f.src);
      expect(/\beval\s*\(/.test(code)).toBe(false);
      expect(/new\s+Function\s*\(/.test(code)).toBe(false);
    });

    it(`${rel} statFile is a real file`, () => {
      expect(statSync(f.path).isFile()).toBe(true);
    });
  }
});
