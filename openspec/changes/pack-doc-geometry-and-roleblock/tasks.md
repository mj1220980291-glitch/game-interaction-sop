## 1. 文档级留白采集（P0）

- [x] 1.1 `compile/geometry.ts`：新增 `captureDocSpacing` —— `docPadding`（原稿根 padding）、`rootGap`（章节同级间距加权 + 块级兄弟间距众数）、`footerGap`（剥掉单孩子 wrapper 后，结尾前空块高度）
- [x] 1.2 量不到写 `gaps`：字段名 + 后果（贴边 / 贴块 / 结尾不留白）+ 修法
- [x] 1.3 `compile/index.ts`：`compile` 与 `verify` 两路都写入 pack
- [x] 1.4 单测 `tests/v2/compile-doc-spacing.spec.ts`（蛋仔型 / 1.14 型 / 缺原稿根）
- [x] 1.5 真机：蛋仔 `verify` 采集 `docPadding{0,60,0,60}` / `rootGap 60` / `footerGap 200`，与手工值一致

## 2. 告警判据（P0）

- [x] 2.1 `pack-audit.ts`：`docPadding` 非全 0 时不报 `sectionShell`
- [x] 2.2 真机 `audit_template_pack` 对蛋仔包 `findings: []`
- [x] 2.3 单测：蛋仔型不报、1.14 型照旧

## 3. 不采项写进契约（P1）

- [x] 3.1 `template-contract.md` 新增「三·七、文档级留白」+ 不采 `placeholder` / `bubbleGrid` 的理由
- [x] 3.2 `assets/packs/README.md`：留白与 `roleBlock` 由编译采集，不手填

## 4. roleBlock 进包（P0）

- [x] 4.1 `template/schema.ts`：`TemplatePack.roleBlock` + 坏字段只丢自己
- [x] 4.2 `render.ts`：`applyPackRoleBlock` 包优先，用户配置兜底
- [x] 4.3 两套包都带上 7 个变体 key（真机 `importComponentByKeyAsync` 7/7 通过）
- [x] 4.4 单测 `tests/v2/role-block-pack.spec.ts`

## 5. 书写契约从包派生（P1）

- [x] 5.1 `md-contract.ts`：文件头注明「模板无该槽位时可省略需求组」
- [x] 5.2 `phase=contract` 可从包重建（现有行为，docs 写明）
- [x] 5.3 `template-compile.md`：契约不留档，丢了重跑即可

## 6. 两套包回归（P1）

- [x] 6.1 蛋仔三项留白由编译采集，数值与手工值一致（60 / 60 / 200）
- [ ] 6.2 蛋仔渲染：无 `V2_W_PACK_GEOMETRY_DEFAULTED`；`@GUI` 彩色 —— **待真机**（沙盒跨文件 import 再次超时，需在 Figma 里 Assets→Libraries 关开一次后复跑）
- [ ] 6.3 1.14 渲染 `ok:true` —— **待真机**（同上）
- [x] 6.4 `npx tsc` + `npx vitest run --no-file-parallelism` 全绿；版本 `0.4.9 → 0.4.10`
