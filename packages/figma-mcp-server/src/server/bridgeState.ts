/**
 * Bridge 端口所有权与进程身份诊断。
 *
 * 真机（2026-11-03）：`render` 周期性报 `Cannot connect to Figma Desktop`，
 * 同一时刻代理工具全部正常。原因是 figma-console-mcp 子进程抢不到首选端口
 * 9223 时**静默退到 9224/9225**，而 Figma 插件只认启动时扫到的 9223——
 * 我们连着自己的子进程，子进程连不上插件，于是只有走 `figma_execute` 的
 * 渲染失败，走同一条 MCP 的其它工具看起来都正常。
 *
 * 这个模块只做三件事：
 *   1. 记住「桥现在到底绑在哪个端口、9223 被谁占着、退到了哪」；
 *   2. 把这段诊断拼进错误信息与 `get_skill_requirements`，别再让人靠 netstat 猜；
 *   3. 给 supervisor 单例用的 pid 锁（双活会制造「升级了但行为不变」的假象）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface BridgeState {
  /** 子进程实际绑定的端口；未探测到时不填。 */
  port?: number;
  /** 首选端口（插件认的那个）。 */
  preferredPort: number;
  /** 子进程是否退到了非首选端口。 */
  fallback: boolean;
  /** 占着首选端口的 pid（如果不是我们自己）。 */
  holderPid?: number;
  /** 探测时刻（ISO）。 */
  checkedAt?: string;
  /** 恢复尝试的结果，人读。 */
  recovery?: string;
}

const state: BridgeState = { preferredPort: 9223, fallback: false };

export function setBridgeState(patch: Partial<BridgeState>): void {
  Object.assign(state, patch, { checkedAt: new Date().toISOString() });
}

export function getBridgeState(): BridgeState & { enginePid: number; supervisorPid?: number } {
  const supervisorPid = Number(process.env.GISOP_SUPERVISOR_PID);
  return {
    ...state,
    enginePid: process.pid,
    ...(Number.isFinite(supervisorPid) && supervisorPid > 0 ? { supervisorPid } : {})
  };
}

/** 端口冲突时给调用方的清理指引（Windows / *nix 各一条，别猜平台）。 */
export function bridgeCleanupHint(port = state.preferredPort): string {
  return (
    `清理占用端口 ${port} 的进程后重启 MCP：` +
    `Windows: netstat -ano | findstr :${port} → taskkill /PID <pid> /F；` +
    `macOS/Linux: lsof -nP -iTCP:${port} -sTCP:LISTEN -t | xargs kill。` +
    '插件掉线后在 Figma 里重新运行 Plugins → Development → Figma Desktop Bridge。'
  );
}

/**
 * 把「连不上插件」的原始报错补成可执行的诊断。
 *
 * 只在确实是端口冲突（`fallback` 或已知占用者）时补，避免把所有连接失败
 * 都归因到端口——插件没开、文件没开也一样会 Cannot connect。
 */
export function describeBridgeFailure(errorMessage: string): string | undefined {
  if (!/cannot connect/i.test(errorMessage)) return undefined;
  const s = getBridgeState();
  if (!s.fallback && s.holderPid === undefined) return undefined;
  const lines = [
    `桥端口冲突：子进程实际绑定 ${s.port ?? '?'}，Figma 插件只认 ${s.preferredPort}`,
    `${s.holderPid !== undefined ? `端口 ${s.preferredPort} 被 pid=${s.holderPid} 占用；` : ''}` +
      `引擎 worker pid=${s.enginePid}${s.supervisorPid ? ` / supervisor pid=${s.supervisorPid}` : ''}`,
    ...(s.recovery ? [`自动恢复：${s.recovery}`] : []),
    bridgeCleanupHint()
  ];
  return lines.join('；');
}

// ---- supervisor 单例锁 ----------------------------------------------------

export const SUPERVISOR_LOCK_FILE =
  process.env.GISOP_SUPERVISOR_LOCK ||
  path.join(os.homedir(), '.game-interaction-sop', 'supervisor.lock');

export interface SupervisorLock {
  pid: number;
  startedAt: string;
}

export function readSupervisorLock(file = SUPERVISOR_LOCK_FILE): SupervisorLock | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<SupervisorLock>;
    if (typeof raw.pid === 'number' && raw.pid > 0) {
      return { pid: raw.pid, startedAt: String(raw.startedAt ?? '') };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 抢 supervisor 单例锁。
 *
 * 双活的代价不是「多一个进程」：工具调用会落在旧进程上，`engineVersion` 报新
 * 版本、行为却是旧代码——上一轮「0.3.2 修了但表现不变」就绕在这上面。
 *
 * 活着的所有者不是自己时返回其 pid，调用方应当让位退出；锁文件坏掉/过期则
 * 直接覆盖。
 */
export function acquireSupervisorLock(file = SUPERVISOR_LOCK_FILE): { ok: true } | { ok: false; holderPid: number } {
  const existing = readSupervisorLock(file);
  if (existing && existing.pid !== process.pid && pidAlive(existing.pid)) {
    return { ok: false, holderPid: existing.pid };
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      'utf-8'
    );
  } catch {
    /* 写不了锁文件不该阻断启动，只是失去单例保护 */
  }
  return { ok: true };
}

export function releaseSupervisorLock(file = SUPERVISOR_LOCK_FILE): void {
  const existing = readSupervisorLock(file);
  if (existing && existing.pid !== process.pid) return;
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* best-effort */
  }
}
