/**
 * 引擎版本 —— 单一来源。
 *
 * 为什么放在 v2 里：回执里出现过「重启前报旧错误、重启后报新错误」，调用方无法
 * 判断拿到的是新代码还是残留的 dist / worker。渲染结果里带上版本号，就能一句话
 * 确认「跑的是不是这次改的 build」。
 */

export const ENGINE_VERSION = '0.4.6';

/** Skill 契约版本：低于这个版本的 skill 会拿不到本版新增的行为约定。 */
export const REQUIRED_SKILL_VERSION = '2.4.0';
