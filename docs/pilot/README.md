# 试点与回归：新用户沙盒怎么用

这份目录放**可重复的从零验证**——用来回答一个问题：**一个没用过的人，照着仓库能不能走通？**

## 一条命令

```bash
npm run sandbox:newuser                 # 当前工作区 + 正常 PATH
npm run sandbox:newuser -- --keep       # 复用沙盒代码（用户目录仍会重置）
npm run sandbox:newuser -- --source git --url <仓库地址>   # 模拟真实拉取
npm run sandbox:newuser -- --path-mode no-node             # 模拟「PATH 里没有 node」
npm run sandbox:newuser -- --only build,engine-boot        # 只跑某几步
npm run sandbox:newuser -- --with-figma --figma-file <key> # 追加真机渲染
```

> `--keep` 只复用**代码副本**；`HOME` / `TEMP` / npm cache 每次都重建 —— 否则上一轮引擎写的
> `supervisor.lock` 还在，就不再是「新机器」了（`env` 步骤会直接红）。

产物落在 `docs/pilot/reports/<时间>.json|.md`。

## 它到底模拟了什么

| 隔离 | 等价于 |
|---|---|
| 独立 `HOME` / `USERPROFILE` | 新机器，`~/.game-interaction-sop` 不存在（这正是蛋仔包丢失时的现场） |
| 独立 `TEMP` / npm cache | 没有残留的桥信息、锁文件 |
| `--path-mode no-node` | 别人的机器：`node`、`npm` 都调不到 |
| `--source worktree` | 「我改完代码还没推，先验一遍」 |
| `--source git` | 「用户拿到链接，git clone 下来」 |

## 八个步骤与判据

| 步 | 判据 |
|---|---|
| `env` | node 绝对路径可用；用户目录没有历史配置；仓库根有 README / SETUP / docs / packages |
| `install` | `npm install` 退出码 0 |
| `build` | 退出码 0，且 `dist/server/index.js` 存在 |
| `install-mcp` | 片段里 `command` 是 node 绝对路径、**不是裸 `node`**、指向沙盒里的 dist |
| `engine-boot` | MCP 握手成功，四个原生工具齐全 |
| `pack-resolution` | 空用户目录下仍能命中**仓库自带**基线包；蛋仔包 `findings: []` |
| `contract` | `phase=contract` 能从包重建书写契约 |
| `guidance` | README 写明「自带基线包 / 零配置」；onboarding 有「你会拿到什么」 |

`no-node` 模式只验三句话：`node -v` 失败、绝对路径可用、把 node 目录加回 PATH 后 `npm -v` 恢复。

## 怎么用它做回归

1. 改完代码，跑一次 `npm run sandbox:newuser`
2. 打开新报告，与上一次对比两列：**每一步的 `status`** 和 **`firstError`**
3. 任何一步从 `pass` 变 `fail` = 这次改动破坏了新用户路径，先修再说

耗时（`durationMs`）只记录、不比较——同机器不同时段波动很大。

## 它覆盖不到的部分

- **宿主的 MCP 面板**（CodeMaker / Cursor 的 UI 配置）——需要真人在 UI 里点
- **别人的 Figma 库权限**——基线包的 key 对团队外无效
- **人能不能看懂文档**——这正是 task 6.1「找个人独立走一遍」要补的
