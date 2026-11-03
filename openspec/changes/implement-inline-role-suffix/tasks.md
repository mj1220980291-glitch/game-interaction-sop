## 1. 拼装与渲染

- [x] 1.1 新增 `v2/role-suffix.ts`：`inlineRoleSuffix` / `withInlineRoleSuffix`（跳过配图与 `@职能` 条目）
- [x] 1.2 渲染（parts）填充前拼装，复用既有 `paintRoleTokens` 上色
- [x] 1.3 移除 `V2_W_ROLE_ANNOTATION_UNSUPPORTED` 的发射
- [x] 1.4 测试：句尾拼接（首条带、其余不动）、无职能原样返回、渲染后带色区间

## 2. 同步口径

- [x] 2.1 `expectedItems` 增 `inlineRoles`，首条普通正文带后缀
- [x] 2.2 `PlanOptions.inlineRoles`，`planReconcile` 调用处按模板包能力传值
- [x] 2.3 测试：`inlineRoles` 开/关两种产出

## 3. 真机验收

- [ ] 3.1 蛋仔包渲染带职能的簇：首条正文以 ` @GUI @程序` 结尾，`@GUI` 有颜色
- [ ] 3.2 同 md 同步两次：`changes: []`（幂等）
- [ ] 3.3 改一条正文再同步：只有那一条被更新，后缀仍在

## 4. 收尾

- [x] 4.1 引擎 `0.3.9` → `0.4.0`，CHANGELOG `v2.5.0`
- [x] 4.2 门槛：`npm run build` + `npm test`（72 files / 577 tests）+ `openspec validate --all --strict`
