/**
 * `roleAnnotation: 'inline-suffix'` 的写法：把职能拼在**正文句尾**。
 *
 * 蛋仔这套模板没有「职能标记」组件位，职能以 `@GUI` `@程序` 的形式跟在条目后面，
 * 并且这些 token 在 Figma 里是带色的（`ROLE_COLORS`）。渲染把 md 整行写进同一个
 * TEXT 节点，所以「拼上去」这一步必须由引擎做；上色由 `paintRoleTokens` 补。
 *
 * 同步要按同一份文本比对，否则每次都会以为条目被改过、来回重写——所以拼装逻辑
 * 放在这里，渲染与同步计划共用。
 */

import type { BulletGroup, SemanticCluster } from './ir.js';

/** `['GUI','程序']` → `'@GUI @程序'`。 */
export function inlineRoleSuffix(roles: ReadonlyArray<string>): string {
  return roles.map((r) => `@${r}`).join(' ');
}

/** 文本是不是「配图条目」或「职能条目」——这两类不承接句尾职能。 */
function isSkippableForSuffix(text: string): boolean {
  const t = text.trim();
  if (t.startsWith('配图')) return true;
  if (/^-\s*配图[:：]/.test(t)) return true;
  return t.startsWith('@');
}

/**
 * 把职能拼到簇里**第一条普通正文**的句尾（分组结构保持不变）。
 *
 * 没有正文可拼时原样返回：宁可少写，也不要挂到配图或另一条职能上。
 */
export function withInlineRoleSuffix(cluster: SemanticCluster): SemanticCluster {
  const suffix = inlineRoleSuffix(cluster.roles);
  if (suffix === '') return cluster;

  let done = false;
  const groups: BulletGroup[] = cluster.groups.map((g) => {
    if (done) return g;
    const bullets = g.bullets.map((b) => {
      if (done || isSkippableForSuffix(b)) return b;
      done = true;
      return `${b} ${suffix}`;
    });
    return { ...g, bullets };
  });
  if (!done) return cluster;
  return { ...cluster, groups, bullets: groups.flatMap((g) => g.bullets) };
}
