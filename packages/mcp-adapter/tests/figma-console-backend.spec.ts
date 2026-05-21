/**
 * Adapter unit tests — use a fake `exec` to capture the generated JS
 * code and assert its shape. We do NOT spin up a real Figma plugin;
 * the goal is to catch regressions in the code-string generation.
 */

import { describe, it, expect } from 'vitest';
import { createFigmaConsoleBackend } from '../src/figma-console-backend.js';
import { FigmaExecError } from '../src/exec.js';

type Captured = { code: string; stubReturn: unknown };

function createFakeExec(plan: Record<string, unknown>) {
  const captured: Captured[] = [];
  const exec = async (code: string) => {
    captured.push({ code, stubReturn: null });
    // match by a distinctive substring
    for (const [marker, value] of Object.entries(plan)) {
      if (code.includes(marker)) {
        captured[captured.length - 1]!.stubReturn = value;
        return value;
      }
    }
    return null;
  };
  return { exec, captured };
}

describe('createFigmaConsoleBackend — script generation', () => {
  it('getNodeInfo emits code that awaits getNodeByIdAsync with the nodeId', async () => {
    const { exec, captured } = createFakeExec({
      '__toNodeInfo': {
        id: 'X:1',
        name: 'hi',
        type: 'FRAME',
        parentId: 'P:1',
        parentType: 'PAGE'
      }
    });
    const backend = createFigmaConsoleBackend({ exec });
    const info = await backend.getNodeInfo('X:1');
    expect(info.id).toBe('X:1');
    expect(info.name).toBe('hi');
    expect(captured).toHaveLength(1);
    expect(captured[0]!.code).toContain('getNodeByIdAsync("X:1")');
    expect(captured[0]!.code).toContain('__toNodeInfo(n)');
  });

  it('getNodeInfo throws if node not found', async () => {
    const exec = async () => null; // missing node
    const backend = createFigmaConsoleBackend({ exec });
    await expect(backend.getNodeInfo('ZZZ:0')).rejects.toThrow(/not found/);
  });

  it('getNodesInfo forwards an array of ids and returns their NodeInfos', async () => {
    const { exec, captured } = createFakeExec({
      'const ids = ["A:1","B:2"]': [
        { id: 'A:1', name: 'a', type: 'TEXT' },
        { id: 'B:2', name: 'b', type: 'FRAME' }
      ]
    });
    const backend = createFigmaConsoleBackend({ exec });
    const arr = await backend.getNodesInfo(['A:1', 'B:2']);
    expect(arr).toHaveLength(2);
    expect(captured[0]!.code).toContain('["A:1","B:2"]');
  });

  it('moveNode embeds numeric x/y literally', async () => {
    const { exec, captured } = createFakeExec({});
    const backend = createFigmaConsoleBackend({ exec });
    await backend.moveNode('N:1', 123.5, -45);
    expect(captured[0]!.code).toMatch(/n\.x = 123\.5;/);
    expect(captured[0]!.code).toMatch(/n\.y = -45;/);
  });

  it('setTextContent JSON-escapes the characters argument', async () => {
    const { exec, captured } = createFakeExec({});
    const backend = createFigmaConsoleBackend({ exec });
    await backend.setTextContent('T:1', '含"双引号"和\n换行');
    expect(captured[0]!.code).toContain(
      JSON.stringify('含"双引号"和\n换行')
    );
  });

  it('setMultipleTextContents is a no-op for empty updates', async () => {
    const { exec, captured } = createFakeExec({});
    const backend = createFigmaConsoleBackend({ exec });
    await backend.setMultipleTextContents([]);
    expect(captured).toHaveLength(0);
  });

  it('setMultipleTextContents batches all updates in one script', async () => {
    const { exec, captured } = createFakeExec({});
    const backend = createFigmaConsoleBackend({ exec });
    await backend.setMultipleTextContents([
      { nodeId: 'T:1', characters: 'hello' },
      { nodeId: 'T:2', characters: 'world' }
    ]);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.code).toContain('"T:1"');
    expect(captured[0]!.code).toContain('"T:2"');
    expect(captured[0]!.code).toContain('"hello"');
    expect(captured[0]!.code).toContain('"world"');
  });

  it('deleteNodes no-ops on empty input', async () => {
    const { exec, captured } = createFakeExec({});
    const backend = createFigmaConsoleBackend({ exec });
    await backend.deleteNodes([]);
    expect(captured).toHaveLength(0);
  });

  it('cloneNode passes x/y/parentId/name through', async () => {
    const { exec, captured } = createFakeExec({
      '__toNodeInfo(clone)': { id: 'C:1', name: 'cloned', type: 'FRAME' }
    });
    const backend = createFigmaConsoleBackend({ exec });
    await backend.cloneNode({
      sourceId: 'S:1',
      parentId: 'P:1',
      x: 10,
      y: 20,
      name: 'cloned'
    });
    const code = captured[0]!.code;
    expect(code).toContain('"sourceId":"S:1"');
    expect(code).toContain('"parentId":"P:1"');
    expect(code).toContain('"x":10');
    expect(code).toContain('"y":20');
    expect(code).toContain('"name":"cloned"');
  });

  it('rasterizeNodeToImageFill defaults scale to 1 when omitted', async () => {
    const { exec, captured } = createFakeExec({});
    const backend = createFigmaConsoleBackend({ exec });
    await backend.rasterizeNodeToImageFill!({
      sourceNodeId: 'S:1',
      targetNodeId: 'T:1'
    });
    expect(captured[0]!.code).toMatch(/const scale = 1;/);
  });

  it('rasterizeNodeToImageFill honours custom scale', async () => {
    const { exec, captured } = createFakeExec({});
    const backend = createFigmaConsoleBackend({ exec });
    await backend.rasterizeNodeToImageFill!({
      sourceNodeId: 'S:1',
      targetNodeId: 'T:1',
      scale: 2
    });
    expect(captured[0]!.code).toMatch(/const scale = 2;/);
  });

  it('wraps exec failures in FigmaExecError with operation name', async () => {
    const exec = async () => {
      throw new Error('sandbox boom');
    };
    const backend = createFigmaConsoleBackend({ exec });
    try {
      await backend.getNodeInfo('X:1');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(FigmaExecError);
      expect((err as FigmaExecError).operation).toBe('getNodeInfo');
      expect((err as FigmaExecError).message).toContain('sandbox boom');
    }
  });
});
