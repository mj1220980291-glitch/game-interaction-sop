import { describe, expect, it } from 'vitest';
import { validate } from '../src/dsl/index.js';
import { plan } from '../src/planner/index.js';
import { loadPlannerFixtures } from './loadFixtures.js';

/**
 * Spec: openspec/changes/build-figma-interaction-doc-engine/specs/layout-planner/spec.md
 *
 * Each fixture under tests/fixtures/<case>/ supplies an input.yaml and
 * expected-plan.json baseline. Adding a new case requires no test changes.
 */

const FIXTURES = loadPlannerFixtures();

if (FIXTURES.length === 0) {
  describe('planner/fixtures', () => {
    it.skip('no fixtures discovered — add one under tests/fixtures/<case>/', () => {});
  });
}

describe.each(FIXTURES)('planner/fixtures — %s', (fx) => {
  it(`${fx.name}: validate then plan matches baseline`, () => {
    const v = validate(fx.inputYaml);
    expect(v.ok, `DSL validation failed for ${fx.name}`).toBe(true);
    if (!v.ok) return;
    const out = plan(v.ir);
    expect(out).toEqual(fx.expectedPlan);
  });

  it(`${fx.name}: plan is deterministic (call twice → identical JSON)`, () => {
    const v = validate(fx.inputYaml);
    if (!v.ok) throw new Error('validation failed');
    const a = JSON.stringify(plan(v.ir));
    const b = JSON.stringify(plan(v.ir));
    expect(a).toBe(b);
  });
});
