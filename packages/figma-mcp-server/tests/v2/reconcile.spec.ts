/**
 * Sync mode of render_v2_markdown_to_figma (openspec change reconcile-render).
 */

import { describe, it, expect } from 'vitest';
import { renderV2MarkdownToFigma, type AssetSpec, type RenderResult } from '../../src/v2/render.js';
import { parseStamp, SCRATCH_ROOT_NAME } from '../../src/v2/reconcile/stamp.js';
import { makeBackend, collectByName, type NodeStore } from './helpers/mock-backend.js';

const HEAD = `# 同步测试

跟进UI：测试
需求组：测试
易协作链接：#待补充
最后更新时间：2026.10.16

## 设计总览

### 功能背景

背景。

### 核心交互

核心交互。
`;

function doc(body: string): string {
  return `${HEAD}\n${body}`.trim();
}

const ONE = (bullets: string[], extra = '') =>
  doc(`## 01. 战斗界面

### 经验条
@GUI @程序

${bullets.map((b) => `- ${b}`).join('\n')}
${extra}`);

type M = ReturnType<typeof makeBackend>;

async function create(m: M, markdown: string, assetMap?: Record<string, AssetSpec>): Promise<string> {
  const r = await renderV2MarkdownToFigma({ markdown, assetMap }, m.backend);
  expect(r.ok, JSON.stringify(r.errors)).toBe(true);
  expect(r.mode).toBe('create');
  return r.rootInstanceId!;
}

async function sync(
  m: M,
  rootId: string,
  markdown: string,
  extra: { scope?: string; dryRun?: boolean; assetMap?: Record<string, AssetSpec> } = {}
): Promise<RenderResult> {
  return renderV2MarkdownToFigma(
    { markdown, assetMap: extra.assetMap, scope: extra.scope, dryRun: extra.dryRun, target: { rootId } },
    m.backend
  );
}

function columns(store: NodeStore, rootId: string) {
  return collectByName(store, rootId, 'Text').filter((n) => n.type === 'FRAME');
}

function blocksOf(store: NodeStore, rootId: string, section = 0) {
  const col = columns(store, rootId)[section]!;
  return col.children.map((id) => store[id]!).filter((n) => n.name.startsWith('说明块'));
}

/** Direct children of a block, as `正文/规则="x"` / `配图` / `foreign:image 45`. */
function layoutOf(store: NodeStore, blockId: string): string[] {
  return store[blockId]!.children
    .map((id) => store[id]! as NodeStore[string] & { stamp?: string })
    .filter((n) => n.name === '正文/规则' || n.name === '配图' || n.name === '#Title' || !n.stamp)
    .map((n) => {
      if (!n.stamp) return `foreign:${n.name}`;
      return n.type === 'TEXT' ? `${n.name}="${n.characters}"` : n.name;
    });
}

function rulesOf(store: NodeStore, rootId: string, block = 0, section = 0) {
  const b = blocksOf(store, rootId, section)[block]!;
  return store[b.id]!.children.map((id) => store[id]!).filter((n) => n.name === '正文/规则');
}

function stampOf(store: NodeStore, id: string) {
  return parseStamp((store[id] as { stamp?: string }).stamp);
}

describe('create mode stamps every engine node', () => {
  it('stamps doc, section, cluster, items, with a manifest that matches the markdown', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a', 'b', '配图：图一', 'c']));

    const docStamp = stampOf(m.store, root);
    expect(docStamp?.kind).toBe('doc');

    const block = blocksOf(m.store, root)[0]!;
    const cs = stampOf(m.store, block.id);
    expect(cs?.kind).toBe('cluster');
    if (cs?.kind !== 'cluster') return;
    expect(cs.items.map((i) => `${i.t}:${i.text}`)).toEqual(['rule:a', 'rule:b', 'figure:图一', 'rule:c']);
    expect(cs.roles).toEqual(['GUI', '程序']);

    // Every direct child of the block is stamped: nothing looks foreign right after a render.
    for (const id of m.store[block.id]!.children) {
      expect(stampOf(m.store, id), `child ${m.store[id]!.name}`).toBeDefined();
    }
    const iids = cs.items.map((i) => i.id);
    expect(new Set(iids).size).toBe(iids.length);
  });
});

describe('reconcile — entry conditions', () => {
  it('refuses a root without a doc stamp', async () => {
    const m = makeBackend();
    const r = await sync(m, m.masterSectionId, ONE(['a']));
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_NOT_STAMPED');
  });

  it('same markdown twice: no changes, no writes', async () => {
    const m = makeBackend();
    const md = ONE(['a', 'b', 'c']);
    const root = await create(m, md);
    const r = await sync(m, root, md);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.mode).toBe('reconcile');
    expect(r.changes).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(m.opBatches).toHaveLength(0);
  });
});

describe('reconcile — items', () => {
  it('inserting in the middle touches nothing else', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a', 'b', 'c']));
    const before = rulesOf(m.store, root).map((n) => n.id);

    const r = await sync(m, root, ONE(['a', 'x', 'b', 'c']));
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.changes).toEqual([{ path: '01/1/#2', action: 'insert', detail: 'x' }]);

    const after = rulesOf(m.store, root);
    expect(after.map((n) => n.characters)).toEqual(['a', 'x', 'b', 'c']);
    expect([after[0]!.id, after[2]!.id, after[3]!.id]).toEqual(before);
    // the scratch doc is gone
    expect(Object.values(m.store).some((n) => n.name === SCRATCH_ROOT_NAME)).toBe(false);
  });

  it('a rewritten line is updated in place', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a', 'b', 'c']));
    const bId = rulesOf(m.store, root)[1]!.id;

    const r = await sync(m, root, ONE(['a', 'b2', 'c']));
    expect(r.changes).toEqual([{ path: '01/1/#2', action: 'update' }]);
    expect(m.store[bId]!.characters).toBe('b2');

    // and the stamp remembers it: a second sync is a no-op
    const again = await sync(m, root, ONE(['a', 'b2', 'c']));
    expect(again.changes).toEqual([]);
  });

  it('keeps a hand edit when markdown did not change that line', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a', 'b']));
    const bId = rulesOf(m.store, root)[1]!.id;
    m.store[bId]!.characters = 'b（设计师改）';

    const r = await sync(m, root, ONE(['a', 'b', 'c']));
    expect(m.store[bId]!.characters).toBe('b（设计师改）');
    expect(r.preserved).toContainEqual({ path: '01/1/#2', kind: 'hand-edit', nodeId: bId });
    expect(rulesOf(m.store, root).map((n) => n.characters)).toEqual(['a', 'b（设计师改）', 'c']);
  });

  it('reports a conflict when both sides changed the same line', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a', 'b']));
    const bId = rulesOf(m.store, root)[1]!.id;
    m.store[bId]!.characters = 'F';

    const r = await sync(m, root, ONE(['a', 'M']));
    expect(r.ok).toBe(true);
    expect(m.store[bId]!.characters).toBe('F');
    expect(r.conflicts).toEqual([{ path: '01/1/#2', kind: 'text', figma: 'F', markdown: 'M', nodeId: bId }]);
  });

  it('does not rebuild a line the designer deleted, now or later', async () => {
    const m = makeBackend();
    const md = ONE(['a', 'b', 'c']);
    const root = await create(m, md);
    const bId = rulesOf(m.store, root)[1]!.id;
    await m.backend.deleteNodes([bId]);

    const r = await sync(m, root, md);
    expect(r.preserved).toContainEqual({ path: '01/1/#2', kind: 'designer-deleted', detail: 'b' });
    expect(rulesOf(m.store, root).map((n) => n.characters)).toEqual(['a', 'c']);

    const r2 = await sync(m, root, ONE(['a', 'b', 'c', 'd']));
    expect(rulesOf(m.store, root).map((n) => n.characters)).toEqual(['a', 'c', 'd']);
    expect(r2.changes).toEqual([{ path: '01/1/#4', action: 'insert', detail: 'd' }]);
  });

  it('flags a deleted line that markdown has since changed', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a', 'b', 'c']));
    await m.backend.deleteNodes([rulesOf(m.store, root)[1]!.id]);

    const r = await sync(m, root, ONE(['a', 'b2', 'c']));
    expect(r.conflicts).toEqual([{ path: '01/1/#2', kind: 'deleted-but-changed', figma: 'b', markdown: 'b2' }]);
    expect(rulesOf(m.store, root).map((n) => n.characters)).toEqual(['a', 'c']);
  });
});

describe('reconcile — foreign nodes', () => {
  it('a hand-copied engine node counts as foreign and is warned about', async () => {
    const m = makeBackend();
    const md = ONE(['A', 'B']);
    const root = await create(m, md);
    const block = blocksOf(m.store, root)[0]!;
    const a = rulesOf(m.store, root)[0]!;
    const copy = m.pasteForeign(block.id, a.id, '正文/规则');
    Object.assign(m.store[copy]!, { type: 'TEXT', characters: 'A', stamp: (a as { stamp?: string }).stamp });

    const r = await sync(m, root, ONE(['B']));
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'V2_W_DUPLICATE_STAMP')).toBe(true);
    // the original A is deleted, the copy survives as foreign
    expect(m.store[a.id]).toBeUndefined();
    expect(m.store[copy]!.characters).toBe('A');
  });

  it('a new line goes after the image pasted behind its predecessor', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['A', 'B']));
    const block = blocksOf(m.store, root)[0]!;
    const aId = rulesOf(m.store, root)[0]!.id;
    m.pasteForeign(block.id, aId);

    const r = await sync(m, root, ONE(['A', 'X', 'B']));
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(layoutOf(m.store, block.id)).toEqual([
      '正文/规则="A"',
      'foreign:image 45',
      '正文/规则="X"',
      '正文/规则="B"'
    ]);
    expect(r.preserved?.some((p) => p.kind === 'foreign' && p.path === '01/1')).toBe(true);
  });

  it('deleting the line before a pasted image leaves the image in place', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['A', 'B', 'C']));
    const block = blocksOf(m.store, root)[0]!;
    m.pasteForeign(block.id, rulesOf(m.store, root)[1]!.id);

    await sync(m, root, ONE(['A', 'C']));
    expect(layoutOf(m.store, block.id)).toEqual(['正文/规则="A"', 'foreign:image 45', '正文/规则="C"']);
  });
});

const TWO_CLUSTERS = (first: string, second: string, firstBullets = ['a'], secondBullets = ['h']) =>
  doc(`## 01. 战斗界面

### ${first}
@GUI

${firstBullets.map((b) => `- ${b}`).join('\n')}

### ${second}
@GUI

${secondBullets.map((b) => `- ${b}`).join('\n')}
`);

describe('reconcile — clusters', () => {
  it('keeps a deleted cluster that holds a pasted image, and says so', async () => {
    const m = makeBackend();
    const root = await create(m, TWO_CLUSTERS('经验条', '血条'));
    const blood = blocksOf(m.store, root)[1]!;
    m.pasteForeign(blood.id, null);

    const r = await sync(m, root, doc(`## 01. 战斗界面

### 经验条
@GUI

- a
`));
    expect(blocksOf(m.store, root)).toHaveLength(2);
    expect(r.conflicts).toEqual([
      { path: '01/-血条', kind: 'container-not-empty', figma: '血条', nodeId: blood.id }
    ]);
  });

  it('deletes a clean cluster together with its bubble', async () => {
    const m = makeBackend();
    const root = await create(m, TWO_CLUSTERS('经验条', '血条'));
    const r = await sync(m, root, doc(`## 01. 战斗界面

### 经验条
@GUI

- a
`));
    expect(r.changes).toContainEqual({ path: '01/-血条', action: 'delete' });
    expect(blocksOf(m.store, root)).toHaveLength(1);
    expect(collectByName(m.store, root, '气泡')[0]!.children).toHaveLength(1);
  });

  it('swapping two clusters moves the blocks and renumbers badge and bubbles', async () => {
    const m = makeBackend();
    const root = await create(m, TWO_CLUSTERS('经验条', '血条'));
    const [exp, blood] = blocksOf(m.store, root).map((b) => b.id);
    m.pasteForeign(blood!, null, 'my image');

    const r = await sync(m, root, TWO_CLUSTERS('血条', '经验条', ['h'], ['a']));
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(blocksOf(m.store, root).map((b) => b.id)).toEqual([blood, exp]);
    expect(collectByName(m.store, blood!, 'my image')).toHaveLength(1);
    expect(collectByName(m.store, blood!, 'Number')[0]!.characters).toBe('1');
    expect(collectByName(m.store, exp!, 'Number')[0]!.characters).toBe('2');
  });

  it('adds a new cluster with its own bubble, without moving existing bubbles', async () => {
    const m = makeBackend();
    const root = await create(m, TWO_CLUSTERS('经验条', '血条'));
    const bubbleFrame = collectByName(m.store, root, '气泡')[0]!;
    const moved = m.store[bubbleFrame.children[1]!]!;
    moved.absoluteBoundingBox = { x: 777, y: 888, width: 40, height: 40 };

    const r = await sync(m, root, doc(`## 01. 战斗界面

### 经验条
@GUI

- a

### 血条
@GUI

- h

### 技能栏
@程序

- s1
- s2
`));
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.changes).toContainEqual({ path: '01/3', action: 'insert' });
    expect(blocksOf(m.store, root)).toHaveLength(3);
    expect(m.store[bubbleFrame.id]!.children).toHaveLength(3);
    expect(m.store[moved.id]!.absoluteBoundingBox).toEqual({ x: 777, y: 888, width: 40, height: 40 });
    const third = blocksOf(m.store, root)[2]!;
    expect(layoutOf(m.store, third.id)).toEqual(['正文/规则="s1"', '正文/规则="s2"']);

    const again = await sync(m, root, doc(`## 01. 战斗界面

### 经验条
@GUI

- a

### 血条
@GUI

- h

### 技能栏
@程序

- s1
- s2
`));
    expect(again.changes).toEqual([]);
  });

  it('role change swaps the role frame', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a']));
    const r = await sync(m, root, doc(`## 01. 战斗界面

### 经验条
@GUI @动效

- a
`));
    expect(r.changes).toContainEqual({ path: '01/1/@roles', action: 'roles', detail: 'GUI 动效' });
    const block = blocksOf(m.store, root)[0]!;
    const roleFrame = m.store[block.id]!.children.map((id) => m.store[id]!).find((n) => n.name.startsWith('Frame 4273'))!;
    expect(roleFrame.children.map((id) => m.store[id]!.characters)).toEqual(['@GUI', '@动效']);
    expect(layoutOf(m.store, block.id)).toEqual(['正文/规则="a"']);
  });
});

const TWO_SECTIONS = (a: string[], b: string[], secondName = '背包界面') =>
  doc(`## 01. 战斗界面

### 经验条
@GUI

${a.map((x) => `- ${x}`).join('\n')}

## 02. ${secondName}

### 格子
@GUI

${b.map((x) => `- ${x}`).join('\n')}
`);

describe('reconcile — sections and scope', () => {
  it('scope "02" writes only section 02', async () => {
    const m = makeBackend();
    const root = await create(m, TWO_SECTIONS(['a'], ['g']));
    const r = await sync(m, root, TWO_SECTIONS(['a2'], ['g2']), { scope: '02' });
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.changes).toEqual([{ path: '02/1/#1', action: 'update' }]);
    expect(rulesOf(m.store, root, 0, 0)[0]!.characters).toBe('a');
    expect(rulesOf(m.store, root, 0, 1)[0]!.characters).toBe('g2');
  });

  it('scope pointing at a missing section is refused without writes', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a']));
    const r = await sync(m, root, TWO_SECTIONS(['a'], ['g']), { scope: '02' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('V2_SCOPE_NOT_FOUND');
    expect(m.opBatches).toHaveLength(0);
  });

  it('renaming a section only rewrites its #Name', async () => {
    const m = makeBackend();
    const root = await create(m, TWO_SECTIONS(['a'], ['g']));
    const r = await sync(m, root, TWO_SECTIONS(['a'], ['g'], '仓库界面'));
    expect(r.changes).toEqual([{ path: '02/#name', action: 'update' }]);
    expect(collectByName(m.store, root, '#Name').map((n) => n.characters)).toEqual(['战斗界面', '仓库界面']);
  });

  it('adds a whole new section', async () => {
    const m = makeBackend();
    const root = await create(m, doc(`## 01. 战斗界面

### 经验条
@GUI

- a
`));
    const r = await sync(m, root, TWO_SECTIONS(['a'], ['g1', 'g2']));
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.changes).toEqual([{ path: '02', action: 'insert' }]);
    expect(rulesOf(m.store, root, 0, 1).map((n) => n.characters)).toEqual(['g1', 'g2']);
    const again = await sync(m, root, TWO_SECTIONS(['a'], ['g1', 'g2']));
    expect(again.changes).toEqual([]);
  });
});

describe('reconcile — dryRun, failure, lock', () => {
  it('dryRun reports the same changes and writes nothing', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a', 'b']));
    const snapshot = JSON.stringify(m.store);
    const dry = await sync(m, root, ONE(['a', 'b2', 'c']), { dryRun: true });
    expect(JSON.stringify(m.store)).toBe(snapshot);
    expect(m.opBatches).toHaveLength(0);
    const real = await sync(m, root, ONE(['a', 'b2', 'c']));
    expect(real.changes).toEqual(dry.changes);
  });

  it('a run that dies half way converges on rerun without duplicates', async () => {
    const m = makeBackend();
    const md1 = TWO_SECTIONS(['a'], ['g']);
    const md2 = TWO_SECTIONS(['a', 'a2', 'a3'], ['g', 'g2']);
    const root = await create(m, md1);

    m.faults.failAfterOps = 2; // the lock stamp + one more op, then fail
    const first = await sync(m, root, md2);
    expect(first.ok).toBe(false);
    expect(first.errors[0]?.code).toBe('V2_RECONCILE_APPLY_FAILED');

    const second = await sync(m, root, md2);
    expect(second.ok, JSON.stringify(second.errors)).toBe(true);
    expect(rulesOf(m.store, root, 0, 0).map((n) => n.characters)).toEqual(['a', 'a2', 'a3']);
    expect(rulesOf(m.store, root, 0, 1).map((n) => n.characters)).toEqual(['g', 'g2']);
    expect(Object.values(m.store).some((n) => n.name === SCRATCH_ROOT_NAME)).toBe(false);

    const third = await sync(m, root, md2);
    expect(third.changes).toEqual([]);

    // Whatever the interrupted run left behind is now in the manifests, so a
    // designer deleting it later is remembered instead of re-inserted.
    const block = blocksOf(m.store, root, 0)[0]!;
    const cs = stampOf(m.store, block.id);
    expect(cs?.kind === 'cluster' && cs.items.map((i) => i.text)).toEqual(['a', 'a2', 'a3']);
    await m.backend.deleteNodes([rulesOf(m.store, root, 0, 0)[1]!.id]);
    await sync(m, root, md2);
    expect(rulesOf(m.store, root, 0, 0).map((n) => n.characters)).toEqual(['a', 'a3']);
  });

  it('adopts an orphan left by an interrupted run into the manifest', async () => {
    const m = makeBackend();
    const md = ONE(['a', 'b']);
    const root = await create(m, md);
    const block = blocksOf(m.store, root)[0]!;
    const orphan = m.pasteForeign(block.id, rulesOf(m.store, root)[1]!.id, '正文/规则');
    Object.assign(m.store[orphan]!, {
      type: 'TEXT',
      characters: 'c',
      stamp: JSON.stringify({ kind: 'item', iid: 'iorphan', t: 'rule', text: 'c' })
    });

    const r = await sync(m, root, ONE(['a', 'b', 'c']));
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.changes).toEqual([]);
    expect(rulesOf(m.store, root).map((n) => n.characters)).toEqual(['a', 'b', 'c']);
    const cs = stampOf(m.store, block.id);
    expect(cs?.kind === 'cluster' && cs.items.map((i) => i.id)).toContain('iorphan');
  });

  it('refuses to run while another sync holds a fresh lock', async () => {
    const m = makeBackend();
    const root = await create(m, ONE(['a']));
    const s = stampOf(m.store, root)!;
    (m.store[root] as { stamp?: string }).stamp = JSON.stringify({ ...s, lock: { runId: 'other', at: Date.now() } });
    const r = await sync(m, root, ONE(['b']));
    expect(r.errors[0]?.code).toBe('V2_RECONCILE_BUSY');
  });
});

describe('reconcile — figures', () => {
  it('applies a new asset to an untouched figure, but not over a hand-placed image', async () => {
    const m = makeBackend();
    m.addSource('src-1', 600, 300);
    m.addSource('src-2', 600, 300);
    const md = ONE(['a', '配图：图一', 'b', '配图：图二']);
    const root = await create(m, md, {
      '01/1/1': { type: 'figma_node', fileKey: 'f', nodeId: 'src-1' }
    });
    const block = blocksOf(m.store, root)[0]!;
    const groups = collectByName(m.store, block.id, '配图');
    const rect2 = collectByName(m.store, groups[1]!.id, '配图占位')[0]! as NodeStore[string] & { fill?: string };
    rect2.fill = 'IMAGE:by-hand';

    const r = await sync(m, root, md, {
      assetMap: {
        '01/1/1': { type: 'figma_node', fileKey: 'f', nodeId: 'src-2' },
        '01/1/2': { type: 'figma_node', fileKey: 'f', nodeId: 'src-2' }
      }
    });
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.changes).toContainEqual({ path: '01/1/#2', action: 'asset', detail: 'figma_node src-2' });
    expect(r.conflicts).toContainEqual({
      path: '01/1/#4',
      kind: 'figure',
      markdown: 'figma_node src-2',
      nodeId: groups[1]!.id
    });
    expect(rect2.fill).toBe('IMAGE:by-hand');
    expect(m.figureFills.map((f) => f.sourceNodeId)).toEqual(['src-1', 'src-2']);
  });
});
