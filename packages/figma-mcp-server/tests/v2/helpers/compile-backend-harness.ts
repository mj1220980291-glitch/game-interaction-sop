/**
 * 编译用后端方法 — createComponentFromNode / combineAsVariants /
 * setPluginData / renameNode / readComponentKey / importComponentByKey。
 *
 * Change: openspec/changes/template-compile-to-library (task 3)
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { buildFigmaConsoleBackend } from '../../../src/server/figmaConsoleBackend.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>;

interface FakeNode {
  id: string;
  name: string;
  type: string;
  key?: string | null;
  data: Record<string, string>;
}

function harness(nodes: FakeNode[], opts: { importFails?: boolean } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let seq = 0;

  const wrap = (n: FakeNode) => ({
    id: n.id,
    type: n.type,
    parent: { id: 'page:1', type: 'PAGE' },
    children: [],
    get name() {
      return n.name;
    },
    set name(v: string) {
      n.name = v;
    },
    get key() {
      return n.key ?? null;
    },
    setSharedPluginData: (ns: string, k: string, v: string) => {
      n.data[`${ns}/${k}`] = v;
    },
    detachInstance: () => {
      const frame: FakeNode = { id: `frame:${++seq}`, name: n.name, type: 'FRAME', data: {} };
      byId.set(frame.id, frame);
      return wrap(frame);
    }
  });

  const page: FakeNode = { id: 'page:1', name: 'Page 1', type: 'PAGE', data: {} };

  const figma = {
    getNodeByIdAsync: async (id: string) => {
      if (id === page.id) return wrap(page);
      const n = byId.get(id);
      return n ? wrap(n) : null;
    },
    createComponentFromNode: (n: { id: string; name: string }) => {
      const id = `comp:${++seq}`;
      const comp: FakeNode = { id, name: n.name, type: 'COMPONENT', data: {} };
      byId.set(id, comp);
      return wrap(comp);
    },
    combineAsVariants: (comps: Array<{ id: string }>, parent: { id: string }) => {
      const set: FakeNode = { id: `set:${++seq}`, name: 'Component Set', type: 'COMPONENT_SET', data: {} };
      byId.set(set.id, set);
      const w = wrap(set);
      w.parent = parent;
      return w;
    },
    importComponentByKeyAsync: async (key: string) => {
      if (opts.importFails) {
        throw new Error(`Could not find a published component with the key "${key}"`);
      }
      const hit = nodes.find((n) => n.key === key);
      return hit ? wrap(hit) : null;
    }
  };

  const client = {
    callTool: async ({ arguments: args }: { arguments: { code: string } }) => {
      const fn = new AsyncFunction('figma', args.code);
      const result = await fn(figma);
      return {
        content: [{ type: 'text', text: JSON.stringify({ _mcp: 'fake', success: true, result }) }]
      };
    }
  } as unknown as Client;

  return { backend: buildFigmaConsoleBackend(client), byId };
}

export { harness };
export type { FakeNode };
