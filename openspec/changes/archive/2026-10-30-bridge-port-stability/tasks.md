## 1. 解析纯函数

- [x] 1.1 `reclaimPorts.ts` 增加 `parseNetstatListeners(out, port)` 与 `parseLsofListeners(out)`，返回 pid 列表
- [x] 1.2 增加 `looksLikeFigmaConsole(cmdline)`：同时含 `figma-console` 与 `mcp`
- [x] 1.3 单测覆盖：netstat 行解析、非 LISTENING 忽略、lsof 多行、命令行识别正负例

## 2. 抢占首选端口

- [x] 2.1 `findListenerOnPort(port)`：win32 用 `netstat -ano -p TCP`，POSIX 用 `lsof`
- [x] 2.2 `readCommandLine(pid)`：win32 `wmic ... get CommandLine`，POSIX `ps -o command=`
- [x] 2.3 `reclaimPreferredPort(port)`：占用者同类 → `killProcessTree`；否则记跳过原因
- [x] 2.4 `worker.ts` 在 spawn 前调用（`PREFERRED_BRIDGE_PORT = 9223`），日志打印结果

## 3. 验证与收尾

- [x] 3.1 `npm run build` + `npm test`（463/463）+ `openspec validate --all --strict` 全绿
- [x] 3.2 真机验证：重启后 `figma_get_status` 端口为 9223 且 `portFallbackUsed: false`（2026-10-30 01:34）
- [x] 3.3 `HANDOFF.md` 更新：坑 1 / 22 标注已修
