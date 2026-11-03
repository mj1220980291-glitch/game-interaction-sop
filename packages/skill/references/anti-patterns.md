# 反模式清单（实战沉淀）

来源：2026-11 主串联 M1/M2 交互文档交付 + 引擎 0.3.2 → 0.3.9 联调。
每条按「症状 / 怎么撞上 / 正确做法 / 自检问题」四段写，**自检问题必须能在动手前回答**。

---

## AP-1 手写 markdown 传参，不读磁盘原文

**症状**
渲染出来的文档和磁盘上的 `.md` 内容不一致；后面同步时引擎按 md 删掉「它以为多余的」条目，甚至连带删掉配图槽，图丢了。

**怎么撞上**
调用 `render_v2_markdown_to_figma` 时凭记忆把 md 内容复制进 `markdown` 参数，中间漏一行、错一个字、少一条 `配图：`。

**正确做法**
- 渲染 / 同步前一律 `read_file` 现取磁盘全文，原样传给引擎
- 要改内容就**先改文件**，再跑渲染；不要「只改参数里的 md」
- 一次交付里多条调用共用同一份文件时，第二次调用前重新读（第一次可能刚改过文件）

**自检**
> 我这次传的 `markdown`，和磁盘上那份文件的字节内容一样吗？说得出「我刚 read 过它」吗？

---

## AP-2 把推测当结论报给引擎

**症状**
报给引擎的「根因」是错的，对方按错的方向改了一版，白跑一轮。

**怎么撞上**
看到报错里的编号（如 `01/2/#8`）就断言「索引口径错了」，实际那只是 `changes` 里的条目序号；真正的错在别处。

**正确做法**
报 bug 固定三段，且第三段必须标注为推测：
1. **观测**：原文错误码 + message + 复现参数（节点 id / md 片段）
2. **影响**：什么场景不可用
3. **推测（未验证）**：我猜是 X，因为 Y；如果 X 成立，应该能看到 Z

能自己验证的先验证（单点 `figma_execute`、对比两次调用差异），不要把「猜」写成「是」。

**自检**
> 我这条结论，有哪一个实测数据支撑？没有的话，我写清「推测」二字了吗？

---

## AP-3 用正式稿做破坏性验证

**症状**
测「删配图会不会丢图」直接拿交付稿开刀，测完图真丢了，只能手工补。

**正确做法**
- 破坏性验证（删条目、删槽、改结构）只在**沙盒 page / 测试文档**上做
- 正式稿只做增量（补图、改文字）
- 万一必须在正式稿上做：先记下要动的节点 id 与图片 hash，测完按清单复原

**自检**
> 这一步如果出错，我能在一分钟内把交付稿恢复原状吗？不能就先建沙盒。

---

## AP-4 手工摆 GROUP 子节点坐标，按局部坐标算

**症状**
手工贴图 / 补占位后，图飞到章节顶部或组框外面，组高算出来是几百甚至几千。

**怎么撞上**
把 `rect.x = 0 / rect.y = 0` 当成「贴到组左上角」。实际 GROUP 的子节点坐标写在**父级坐标系**里，归零 = 飞到父级原点。

**正确做法**
- GROUP 类型槽位：子节点位置用 `父级坐标 = group.x / group.y`，文案在 `group.y + rect.h + gap`
- 摆完再 `group.resize(w, rect.h + gap + hint.h)`
- 判断「摆没摆对」只看绝对坐标：`rect.abs - group.abs === (0,0)`

**自检**
> 我设的是 `group.x/group.y` 还是 `0`？改完我量过 `absoluteBoundingBox` 差值吗？

---

## AP-5 拿低分辨率裁图硬填宽槽

**症状**
100×100 的图标裁图填进 1231 宽的槽位，放大 12 倍变马赛克，最后还得回退。

**正确做法**
- 填之前算比例：`槽宽 / 裁图宽`，超过 2 倍就考虑不填
- 引擎的规则是「小图不放大」（按裁出区域宽高比定高、宽度上限为说明栏宽），所以小裁图会保持原尺寸，不会自动放大——想铺满就得给大图
- 拿不到高清图 → 留占位并在审计清单里写明「缺高清图」，比塞马赛克诚实

**自检**
> 这张图放进去会被放大几倍？放大后还能看吗？

---

## AP-6 改错配置文件想切模板包

**症状**
改了 `~/.game-interaction-sop/template.json`，渲染返回的 `pack.project` 还是老项目。

**正确做法**
模板包解析顺序（首个命中即用）：

1. 环境变量 `GISOP_TEMPLATE_PACK`（显式路径；`off` 关闭查找）
2. `<cwd>/.interaction-sop/template.json`
3. `~/.game-interaction-sop/templates/<GISOP_PROJECT>.json`
4. `~/.game-interaction-sop/templates/default.json`

`~/.game-interaction-sop/template.json` **不在**这个列表里（它是 roleBlock / 地址的旧配置）。
切换后**必须看返回体的 `pack.path` / `pack.project`** 确认真的切过去了，不要凭「我改过文件」下结论。

**自检**
> 本次返回的 `pack.project` 是什么？和我要的一致吗？

模板包里 `components` 是**已发布组件的 key**，引擎按 key 从团队库导入，**不需要**打开模板源文件；只有「同文件模式」（包内只有 `fileKey` + `nodeId`）才要求目标文件就是模板文件。

---

## AP-7 端口 / 多进程问题靠反复重开插件

**症状**
`Cannot connect to Figma Desktop` 反复出现，重开插件好一阵又坏；`enginePid` 每次调用都变。

**正确做法**
按证据定位，别靠重启：

1. `figma_get_status` 看 `portFallbackUsed`、`otherInstances`、`connectedFiles`
2. **两份 server 并存**时先清进程（旧 supervisor 会抢着接请求，表现为「升级了但行为没变」）
3. 渲染返回 `E_BRIDGE_PORT_CONFLICT` 时读 `details.bridge` 的 `holderPid` 再清理
4. 确认「这次测的是不是新 build」：`engineVersion` + `bridge.fallback=false` + `summary` 里本次新增字段存在

**自检**
> 我是先看了进程/端口证据，还是先重启了插件？

---

## AP-8 结论不落到实测数据

**症状**
「修好了」「还是坏的」都靠肉眼，下一轮又要重新判断，双方各说各话。

**正确做法**
每次验收固定跑一组断言，把数值贴给对方：

```js
// 配图槽（所有 配图 GROUP）
const rect = g.children.find(c => c.name === '配图占位');
const hint = g.children.find(c => c.name === '配图占位文案');
// 1 绝对坐标：rect.abs - group.abs === (0,0)
// 2 文案在灰板下方：hint.abs.y >= rect.abs.y + rect.abs.height
// 3 组高自洽：|group.abs.height - ((hint.abs.y + hint.abs.height) - group.abs.y)| <= 2
// 4 缺资产槽组高 == rect.h + gap + hint.h（官方 1.14 是 323）

// 章节左列（章节框内名为「左列」的 FRAME）
// 5 layoutSizingVertical === 'HUG' && height === 标题高 + 主图高
// 6 所在横向行 counterAxisAlignItems === 'MIN'

// 文档级
// 7 槽数 === md 里 `配图：` 条数
// 8 summary.figureSlotsUnhealthy === 0
```

**自检**
> 我这句结论，对应哪一条断言、哪个节点 id、哪个数值？

---

## 一句话

**一次只验证一个假设。** 连续做两个未验证的假设，返工成本翻倍——本轮真正拖时间的不是引擎 bug，而是「手写 md 漂移」和「GROUP 坐标按局部算」这两次自造返工。
