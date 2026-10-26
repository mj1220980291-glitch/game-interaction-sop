/**
 * figma_compile_template MCP 工具：注册、必填参数、干跑默认、写入门槛。
 *
 * Spec: engine-mcp-server「模板编译工具」
 * Change: template-compile-to-library (11.2)
 */

import { describe, it, expect } from 'vitest';
import { buildNativeTools } from '../../src/server/createServer.js';
import type { FigmaBackend } from '../../src/v2/figma-client.js';

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

const okBackend = {
  async getNodeInfo(id: string) {
    return { id, name: 'Page 1', type: 'PAGE' as const };
  }
} as unknown as FigmaBackend;

const base = {
  phase: 'compile',
  project: '惊魂寻宝队',
  source: { nodeId: '798:17608' },
  library: { fileKey: 'LIB', pageId: 'page:1' }
};

function tool(backend: FigmaBackend = okBackend) {
  return buildNativeTools({ v2Backend: backend }).find(
    (d) => d.tool.name === 'figma_compile_template'
  )!;
}

describe('figma_compile_template', () => {
  it('注册并声明写入类', () => {
    const def = tool();
    expect(def.tool.description).toContain('写入');
    expect(def.tool.description).toContain('write');
  });

  it('缺 library.pageId → 参数错误', async () => {
    const r = (await tool().handler({
      phase: 'compile',
      project: 'P',
      source: { nodeId: 'n1' },
      library: { fileKey: 'LIB' }
    })) as ToolResult;
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0]!.text).message).toContain('library.pageId');
  });

  it('write 缺省为干跑：出计划、不写、不建组件', async () => {
    const r = (await tool().handler({
      ...base,
      staged: { top: 's1', chapter: 's2', cluster: 's3' }
    })) as ToolResult;
    const body = JSON.parse(r.content[0]!.text);
    expect(body.written).toBe(false);
    expect(body.parts).toHaveLength(3);
    expect(body.parts.every((p: { componentId: unknown }) => p.componentId === null)).toBe(true);
    expect(body.gaps.some((g: { what: string }) => g.what.includes('结尾'))).toBe(true);
  });

  it('干跑缺部件也能报出来', async () => {
    const r = (await tool().handler({ ...base, staged: { top: 's1' } })) as ToolResult;
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0]!.text).message).toContain('章节');
  });

  it('write 但缺 partsPageId → 明确拒绝', async () => {
    const r = (await tool().handler({
      ...base,
      staged: { top: 's1', chapter: 's2', cluster: 's3' },
      write: true
    })) as ToolResult;
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0]!.text).message).toContain('partsPageId');
  });

  it('未配置 v2Backend → 报后端不可用', async () => {
    const def = buildNativeTools().find((d) => d.tool.name === 'figma_compile_template')!;
    const r = (await def.handler({ ...base })) as ToolResult;
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0]!.text).code).toBe('V2_BACKEND_UNAVAILABLE');
  });
});
