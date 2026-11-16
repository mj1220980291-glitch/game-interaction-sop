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
import { ruleFor, ruleOf } from '../capability-contract.js';

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

/** 槽位探针说没有标号容器时的兜底文案（能力值与实测可能不一致）。 */
const BADGE_MISSING_FORBID = '不要依赖图上标号（模板没有标号容器，标号不会生成）';

export function buildMdContract(pack: TemplatePack, opts: MdContractOptions = {}): MdContract {
  const c = pack.capabilities;
  const hasFigure = opts.slots?.figure ?? ruleOf(c, 'figure').render?.figureSlots === 'consume';
  const hasBadge = opts.slots?.badge ?? ruleOf(c, 'badgeSlot').render?.badgeCount === 'clusters';
  const hasTitle = opts.slots?.sectionTitle ?? true;
  const project = pack.project ?? '未命名项目';

  // 文案与禁写项全部来自能力表；槽位实测与之冲突时以实测为准并回落到兜底文案。
  const overview = ruleOf(c, 'overview').contract?.overview ?? '';
  const groups = ruleOf(c, 'clusterGroups').contract?.groups ?? '';
  const roles = ruleOf(c, 'roleAnnotation').contract?.roles ?? '';
  const figure = hasFigure
    ? ruleFor('figure', 'named-group').contract?.figure ?? ''
    : ruleFor('figure', 'none').contract?.figure ?? '';
  const badge = ruleOf(c, 'badgeSlot').contract?.badge ?? '';
  const number = ruleOf(c, 'numberBadge').contract?.number ?? '';
  const column = ruleOf(c, 'column').contract?.column ?? '';

  const forbid = [
    ruleOf(c, 'overview').contract?.forbid,
    ruleOf(c, 'clusterGroups').contract?.forbid,
    hasFigure ? undefined : ruleFor('figure', 'none').contract?.forbid,
    hasBadge ? undefined : ruleOf(c, 'badgeSlot').contract?.forbid ?? BADGE_MISSING_FORBID
  ].filter((f): f is string => typeof f === 'string');

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
    ...(ruleOf(c, 'overview').render?.overviewSlots !== 'none'
      ? ['', '## 设计总览', '', '### 功能背景', '<一段说明>', '', '### 核心交互', '- <一条交互>']
      : []),
    '',
    '## 01. 界面名称',
    '',
    '### 簇标题',
    ruleOf(c, 'roleAnnotation').render?.roleBlocks === 'insert' ? '@GUI' : '',
    '- <一条规则>',
    ...(hasFigure ? ['- 配图：<说明>'] : []),
    '```',
    '',
    `> 列布局：${column}；${number}`,
    '',
    '> 文件头四行是契约要求的顺序；**顶部部件没有「需求组」槽位时**（如蛋仔），',
    '> 该行可省略，写了只会得到一条 `V2_W_HEADER_SLOT_MISSING` 软告警。'
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return { path: MD_CONTRACT_RELATIVE_PATH, content: `${content}\n` };
}
