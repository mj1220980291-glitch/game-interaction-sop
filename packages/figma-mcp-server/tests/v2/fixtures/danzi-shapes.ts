/**
 * 蛋仔形状 fixture —— 真机踩出来的结构，不再只活在对话里。
 *
 * 官方 `1:14` 是「扁平 + 图区/说明栏 + 编号是文本」；蛋仔这几处全不一样，
 * 每一处都曾经让渲染返工：
 *
 *   顶部   Banner + 标题行 + 文档说明 三块；标题行里「职能注意 + 标签行」靠左，
 *          右上还有「策划 / UX / 审核者」；文档说明里同时有「文档说明」和
 *          「界面说明」两个区块标题 + 一条需求链接
 *   章节   左列(标题 + 舞台) | 说明栏；标题与图之间是原稿的 60px；气泡 1920×1080
 *          比主图 1200×719 大一圈
 *   簇     正文与配图都嵌在 `Frame 808` 里；编号是实例；原稿带 3 张大截图 + 1 张小图
 *
 * 用法：这些 builder 直接喂 `slotsBackend(...)`，配合 normalize / slim 的单测。
 */

import type { NodeInfo } from '../../../src/v2/figma-client.js';
import { n } from '../helpers/slots-backend.js';

/** 蛋仔顶部：Banner + 标题行（标签行靠左、右侧三块）+ 文档说明（两个区块标题 + 链接）。 */
export function danziTop(): NodeInfo[] {
  return [
    n('top', '蛋仔派对 / 顶部', 'COMPONENT', ['banner', 'row', 'intro'], { w: 2205, h: 1726 }),
    n('banner', 'Banner', 'FRAME', [], { w: 2198, h: 814 }),
    n('row', '标题行', 'GROUP', ['updated', 'docTitle', 'roleNote', 'tagRow', 'sidePlan', 'sideUx', 'sideAuditor'], {
      w: 2205,
      h: 321
    }),
    n('updated', '2025/07/02', 'TEXT', [], { text: '2025/07/02', w: 216, h: 52, x: 7, y: 0 }),
    n('docTitle', '局内相关交互', 'TEXT', [], { text: '局内相关交互', w: 518, h: 125, x: 0, y: 60 }),
    n('roleNote', '职能注意', 'TEXT', [], { text: '职能注意', w: 176, h: 71, x: 7, y: 250 }),
    n('tagRow', 'Frame 80', 'FRAME', ['tag1', 'tag2', 'tag3'], { w: 1314, h: 68, x: 205, y: 250 }),
    n('tag1', '标签', 'INSTANCE', [], { w: 199, h: 68, x: 0, y: 0 }),
    n('tag2', '标签', 'INSTANCE', [], { w: 199, h: 69, x: 223, y: 0 }),
    n('tag3', '标签', 'INSTANCE', [], { w: 199, h: 70, x: 446, y: 0 }),
    // 右上三块的 y 取自真机：策划/UX 在标签行上方，审核者与标签行同一带（会挡路）。
    n('sidePlan', 'UI', 'FRAME', [], { w: 279, h: 70, x: 1919, y: 83 }),
    n('sideUx', 'UI', 'FRAME', [], { w: 247, h: 70, x: 1951, y: 165 }),
    n('sideAuditor', 'UI', 'FRAME', [], { w: 612, h: 70, x: 1593, y: 250 }),
    n('intro', '文档说明', 'FRAME', ['introHeading', 'ticket', 'sectionHeading'], { w: 2204, h: 591 }),
    n('introHeading', '界面设计', 'TEXT', [], { text: '文档说明', w: 320, h: 116, x: 56, y: 0 }),
    n('ticket', 'issue', 'TEXT', [], {
      text: 'UI设计 #367218 【OGC2组】搜打撤局内界面 https://u5.pm.netease.com/v6/issues/367218',
      w: 2007,
      h: 65,
      x: 85,
      y: 180
    }),
    n('sectionHeading', '界面设计', 'TEXT', [], { text: '界面说明', w: 320, h: 116, x: 56, y: 475 })
  ];
}

/**
 * 蛋仔簇：`Group 1253` = 编号实例 + `#Title_Main` + `Frame 808`（正文 + 3 张大截图 + 1 张小图）。
 *
 * 尺寸取真机实测：簇 916 宽，截图 872×490，正文 872 宽，小图 127×123。
 */
export function danziCluster(): NodeInfo[] {
  return [
    n('k', '蛋仔派对 / 簇', 'COMPONENT', ['group'], { w: 916, h: 1417 }),
    n('group', 'Group 1253', 'GROUP', ['title', 'num', 'body'], { w: 916, h: 1417 }),
    n('title', '#Title_Main', 'TEXT', [], { text: '撤离', w: 72, h: 52, x: 47, y: 0 }),
    n('num', 'Number', 'INSTANCE', [], { w: 63, h: 63, x: 0, y: 0 }),
    n('body', 'Frame 808', 'FRAME', ['rule', 'shot1', 'shot2', 'shot3', 'icon'], { w: 916, h: 1337 }),
    n('rule', '正文/规则', 'TEXT', [], { text: '当玩家身处车内时，若是当前目标已经完成，则此处撤离按钮亮起。', w: 872, h: 129 }),
    n('shot1', 'Frame 632', 'INSTANCE', [], { w: 872, h: 490 }),
    n('shot2', 'Group 427319372', 'GROUP', ['shot2a'], { w: 872, h: 490 }),
    n('shot2a', 'Frame 537', 'INSTANCE', [], { w: 872, h: 490 }),
    n('shot3', 'Frame 629', 'INSTANCE', [], { w: 872, h: 490 }),
    n('icon', 'image 37982', 'RECTANGLE', [], { w: 127, h: 123, hasImageFill: true })
  ];
}

/**
 * 蛋仔章节：`左列(标题 + 舞台) | 说明栏`，标题与图间距按原稿 60，气泡比主图大。
 *
 * 源稿坐标：标题块 y=651 h=75，章节组 y=786 → gap 60；主图 1200×719；气泡 1920×1080。
 */
export function danziChapter(): NodeInfo[] {
  return [
    n('ch', '蛋仔派对 / 章节', 'COMPONENT', ['left', 'column'], { w: 2209, h: 805 }),
    n('left', '左列', 'FRAME', ['chTitle', 'stage'], { w: 1200, h: 805 }),
    n('chTitle', '标题', 'FRAME', ['name'], { w: 285, h: 62 }),
    n('name', '#Name', 'TEXT', [], { text: '界面名称', w: 232, h: 62 }),
    n('stage', '舞台', 'FRAME', ['mainImage', 'bubble'], { w: 1200, h: 719 }),
    n('mainImage', '主图占位', 'RECTANGLE', [], { w: 1200, h: 719 }),
    n('bubble', '气泡', 'FRAME', ['master'], { w: 1920, h: 1080 }),
    n('master', '标号/母版', 'FRAME', [], { w: 48, h: 48, visible: false }),
    n('column', 'Text', 'FRAME', [], { w: 932, h: 1 })
  ];
}

/** 蛋仔契约写法：无总览、职能写在条目句尾。 */
export const DANZI_MARKDOWN = `# 局内相关交互

跟进UI：邵腾
需求组：局内交互
易协作链接：https://u5.pm.netease.com/v6/issues/367218
最后更新时间：2026.10.28

## 01. 撤离入口

### 入口与状态

- 玩家身处车内且当前目标已完成时，撤离按钮亮起 @GUI
- 配图：撤离入口示意
`;
