/**
 * 主图实例替换的层序规则。
 *
 * 反馈 #2 P1-3：`appendChild` 会把主图扔到父级末尾，压住同父的「气泡」。
 * 真机行为由 Figma 侧执行，这里锁住生成脚本的关键语句，防止回退。
 *
 * Spec: template-render「标号摆位 / 主图实例不压住标号」
 */

import { describe, it, expect } from 'vitest';
import { buildPlaceInstanceScript } from '../../src/server/figmaConsoleBackend.js';

const script = buildPlaceInstanceScript('src:1', 'ph:2');

describe('placeInstance 脚本', () => {
  it('按占位原索引插入，而不是追加到末尾', () => {
    expect(script).toContain('const idx = parent.children.indexOf(ph)');
    expect(script).toContain('parent.insertChild(idx, inst)');
    // appendChild 只作为「拿不到索引」的兜底分支存在。
    expect(script).toContain('else parent.appendChild(inst)');
  });

  it('继承占位节点名称（保持「主图」槽位可被同步识别）', () => {
    expect(script).toContain('inst.name = ph.name');
  });

  it('删除占位发生在插入与改名之后', () => {
    const insertAt = script.indexOf('parent.insertChild(idx, inst)');
    const renameAt = script.indexOf('inst.name = ph.name');
    const removeAt = script.indexOf('ph.remove()');
    expect(insertAt).toBeGreaterThan(-1);
    expect(renameAt).toBeGreaterThan(insertAt);
    expect(removeAt).toBeGreaterThan(renameAt);
  });

  it('源与占位 id 被安全序列化进脚本', () => {
    expect(script).toContain('"src:1"');
    expect(script).toContain('"ph:2"');
  });
});
