/**
 * 职能标签配置随包分发：包优先，用户配置兜底。
 *
 * 背景（2026-11-11）：7 个变体 key 只存在 `~/.game-interaction-sop/template.json`，
 * 换机器就丢、丢了不报错，和蛋仔模板包丢失是同一个病。
 */

import { describe, it, expect } from 'vitest';
import { applyPackRoleBlock } from '../../src/v2/render.js';
import type { PackResolution } from '../../src/v2/template-config.js';

const packWithRole = (roleBlock: Record<string, unknown>): PackResolution =>
  ({
    hit: {
      path: 'assets/packs/蛋仔派对.json',
      origin: 'bundled-project',
      pack: { roleBlock }
    },
    candidates: []
  }) as unknown as PackResolution;

const userConfig = {
  roleBlock: {
    variantKeys: { GUI: 'user-gui' },
    variantPrefix: '职能标记=',
    labelTextName: '文本'
  },
  configPath: 'C:\\Users\\me\\.game-interaction-sop\\template.json'
} as never;

describe('roleBlock 解析优先级', () => {
  it('包里有就用包里的，并回显包路径', () => {
    const got = applyPackRoleBlock(
      { ...(userConfig as object) } as never,
      packWithRole({ variantKeys: { GUI: 'pack-gui' } })
    );
    expect(got.roleBlock?.variantKeys).toEqual({ GUI: 'pack-gui' });
    expect(got.configPath).toContain('蛋仔派对.json');
  });

  it('包里没有时原样用用户配置', () => {
    const got = applyPackRoleBlock(
      { ...(userConfig as object) } as never,
      { candidates: [] } as unknown as PackResolution
    );
    expect(got.roleBlock?.variantKeys).toEqual({ GUI: 'user-gui' });
    expect(got.configPath).toContain('template.json');
  });

  it('包只给前缀时，key 仍走用户配置', () => {
    const got = applyPackRoleBlock(
      { ...(userConfig as object) } as never,
      packWithRole({ variantPrefix: '职能=' })
    );
    // 没有 variantKeys / componentSetId 的 roleBlock 视为没写，不改行为
    expect(got.roleBlock?.variantKeys).toEqual({ GUI: 'user-gui' });
    expect(got.roleBlock?.variantPrefix).toBe('职能标记=');
  });
});
