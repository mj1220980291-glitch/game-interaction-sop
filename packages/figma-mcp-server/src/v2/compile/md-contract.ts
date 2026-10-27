/**
 * `md-contract.md` —— 模板的「书写契约」投影。
 *
 * `template.json` 给机器看（4 个 key + 8 项能力），本文件给写 md 的人 / agent 看：
 * 这套模板能写什么、不能写什么。正文完全由模板包推导，同一份包重复生成逐字节一致。
 *
 * 写盘不在这里做：MCP 进程不知道项目根在哪，猜路径会写错地方。
 *
 * Spec: openspec/changes/engine-multi-part-template-render (D8 / template-compile)
 */

import { CHAPTER_SLOTS, TOP_SLOTS } from '../template-slots.js';
import type { TemplatePack } from '../template/schema.js';

export interface MdContractOptions {
  /** 模板实际拥有的槽位；缺省视为都有。 */
  slots?: { figure?: boolean; badge?: boolean; sectionTitle?: boolean };
}

export interface MdContract {
  /** 建议落盘路径（相对项目根）。 */
  path: string;
  content: string;
}

export const MD_CONTRACT_RELATIVE_PATH = '.interaction-sop/md-contract.md';

export function buildMdContract(pack: TemplatePack, opts: MdContractOptions = {}): MdContract {
  const c = pack.capabilities;
  const hasFigure = opts.slots?.figure ?? c.figure !== 'none';
  const hasBadge = opts.slots?.badge ?? c.badgeSlot === 'container';
  const hasTitle = opts.slots?.sectionTitle ?? true;
  const project = pack.project ?? '未命名项目';

  const forbid: string[] = [];
  if (c.overview === 'none') forbid.push('不要写 `## 设计总览`（模板没有总览区，写了会拒绝渲染）');
  if (c.clusterGroups === 'none') forbid.push('不要使用 `####`（模板簇内不支持分级，写了会拒绝渲染）');
  if (c.figure === 'none') forbid.push('不要写 `配图：`（模板没有配图槽，配图会被丢弃）');
  if (!hasBadge) forbid.push('不要依赖图上标号（模板没有标号容器，标号不会生成）');

  const overview =
    c.overview === 'two-frames'
      ? '`## 设计总览` 下写 `### 功能背景` 与 `### 核心交互` 两段，各一段正文。'
      : c.overview === 'single-block'
        ? '`## 设计总览` 下只写一段（模板只有单块总览，第二段会被隐藏）。'
        : '不写总览（模板没有总览区）。';

  const groups =
    c.clusterGroups === 'slot-run'
      ? '簇内可用 `#### 分组标题` 分组，每组下接 `- ` 条目。'
      : c.clusterGroups === 'inline-subtitle'
        ? '簇内不用 `####`；把分组标题写在首条条目的句首（渲染成「标题：内容」）。'
        : '簇内不分组：一个 `### 簇` 直接跟 `- ` 条目。';

  const roles =
    c.roleAnnotation === 'component-variant'
      ? '职能写成独立一行 `@GUI @程序`（渲染为「职能标记」组件）。'
      : c.roleAnnotation === 'inline-suffix'
        ? '职能写在条目句尾，例如 `- 点击入口打开面板 @GUI`。'
        : '不写 `@职能`（模板不表达职能）。';

  const figure = hasFigure
    ? '在条目位置写 `- 配图：说明文字`，渲染时按顺序放入配图槽。'
    : '不写配图条目（模板没有配图槽）。';

  const badge =
    c.badgeSlot === 'container'
      ? `每个簇在图上自动生成一个标号（1、2、3…），位置按模板网格；不要手写编号。`
      : '模板不在图上生成标号，需要人工摆放。';

  const number =
    c.numberBadge === 'none'
      ? '簇不显示编号。'
      : '簇编号由引擎按顺序写入，不要在标题里重复写编号。';

  const column =
    c.column === 'right' ? '说明栏在图右侧。' : '说明栏在图下方。';

  const content = [
    `# ${project} 交互文档书写契约`,
    '',
    '> 本文件由模板自动生成，请勿手改；模板重编后重新生成。',
    '',
    '## 1. 顶部字段',
    '',
    `顶部包含：${[
      TOP_SLOTS.docTitle,
      TOP_SLOTS.owner,
      TOP_SLOTS.group,
      TOP_SLOTS.ticketLink,
      TOP_SLOTS.lastUpdate
    ].join(' / ')}。按 \`字段：值\` 逐行书写。`,
    '',
    '## 2. 章节',
    '',
    '`## NN. 界面名称`，NN 为两位序号。',
    hasTitle ? `章节标题写入模板的 \`${CHAPTER_SLOTS.sectionTitle}\`。` : '本模板章节标题为共用块，按文档约定填写。',
    '',
    '## 3. 簇',
    '',
    '`### 簇标题`，下面接 `- ` 条目；一个簇对应图上的一处说明。',
    '',
    '## 4. 分组',
    '',
    groups,
    '',
    '## 5. 配图',
    '',
    figure,
    '',
    '## 6. 标号',
    '',
    badge,
    '',
    '## 7. 职能',
    '',
    roles,
    '',
    '## 8. 总览',
    '',
    overview,
    '',
    '## 9. 禁写清单',
    '',
    ...(forbid.length > 0 ? forbid.map((f) => `- ${f}`) : ['- 无额外限制']),
    '',
    '## 10. 最小骨架',
    '',
    '```markdown',
    `# 需求名称`,
    '',
    `跟进UI：${'<设计师>'}`,
    `需求组：${'<需求组>'}`,
    '易协作链接：#待补充',
    '最后更新时间：YYYY.MM.DD',
    ...(c.overview !== 'none'
      ? ['', '## 设计总览', '', '### 功能背景', '<一段说明>', '', '### 核心交互', '- <一条交互>']
      : []),
    '',
    '## 01. 界面名称',
    '',
    '### 簇标题',
    c.roleAnnotation === 'component-variant' ? '@GUI' : '',
    '- <一条规则>',
    ...(hasFigure ? ['- 配图：<说明>'] : []),
    '```',
    '',
    `> 列布局：${column}；${number}`
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return { path: MD_CONTRACT_RELATIVE_PATH, content: `${content}\n` };
}
