import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Auto-discovers fixture cases under tests/fixtures/<case>/.
 * Each case MUST have:
 *   - input.yaml          (DSL YAML to validate + plan)
 *   - expected-plan.json  (planner output baseline, JSON)
 */

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const FIXTURES_ROOT = resolve(__dirname, 'fixtures');

export interface PlannerFixture {
  name: string;
  inputYaml: string;
  expectedPlan: unknown;
  fixtureDir: string;
}

export function loadPlannerFixtures(): PlannerFixture[] {
  if (!existsSync(FIXTURES_ROOT)) return [];
  const out: PlannerFixture[] = [];
  for (const entry of readdirSync(FIXTURES_ROOT)) {
    const dir = join(FIXTURES_ROOT, entry);
    if (!statSync(dir).isDirectory()) continue;
    const inputPath = join(dir, 'input.yaml');
    const expectedPath = join(dir, 'expected-plan.json');
    if (!existsSync(inputPath) || !existsSync(expectedPath)) continue;
    out.push({
      name: entry,
      inputYaml: readFileSync(inputPath, 'utf8'),
      expectedPlan: JSON.parse(readFileSync(expectedPath, 'utf8')),
      fixtureDir: dir
    });
  }
  return out;
}
