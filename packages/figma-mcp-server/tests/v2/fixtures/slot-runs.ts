/**
 * run 形状 fixture —— 两种「同一个簇，不同模板长相」。
 *
 * `officialTwoRuns` 是 `官方1.14` 的真实形状（表头 + 2 段 run，每段带职能帧与
 * 配图 GROUP）；`bareFigureRun` 是蛋仔那类（配图是裸矩形）。
 *
 * 用法：直接喂 `slotsBackend(...)`，编译瘦身与渲染的单测共用同一份形状定义。
 */

import type { NodeInfo } from '../../../src/v2/figma-client.js';
import { n } from '../helpers/slots-backend.js';

/** `官方1.14` 说明块：表头 + 2 段 run。 */
export function officialTwoRuns(): NodeInfo[] {
  return [
    n('k', '说明块01', 'COMPONENT', ['header', 't1', 'rf1', 'b1', 'b2', 'f1', 't2', 'rf2', 'b3', 'b4', 'f2'], {
      w: 932,
      h: 867,
      layoutMode: 'VERTICAL'
    }),
    n('header', '标题', 'GROUP', ['main', 'num'], { w: 932, h: 120 }),
    n('num', 'Number', 'TEXT', [], { text: '1', w: 40, h: 40 }),
    n('main', '#Title_Main', 'TEXT', [], { text: '撤离入口', w: 200, h: 44 }),

    n('t1', '#Title', 'TEXT', [], { text: '小标题1', w: 300, h: 44 }),
    n('rf1', 'Frame 427319720', 'FRAME', [], { w: 300, h: 40 }),
    n('b1', '正文/规则', 'TEXT', [], { text: '旧规则一', w: 800, h: 44 }),
    n('b2', '正文/规则', 'TEXT', [], { text: '旧规则二', w: 800, h: 44 }),
    n('f1', '配图', 'GROUP', ['fr1', 'fh1'], { w: 800, h: 450 }),
    n('fr1', '配图占位', 'RECTANGLE', [], { w: 800, h: 450 }),
    n('fh1', '配图占位文案', 'TEXT', [], { text: '配图占位：待手动替换', w: 400, h: 40 }),

    n('t2', '#Title', 'TEXT', [], { text: '小标题2', w: 300, h: 44 }),
    n('rf2', 'Frame 427319721', 'FRAME', [], { w: 300, h: 40 }),
    n('b3', '正文/规则', 'TEXT', [], { text: '旧规则三', w: 800, h: 44 }),
    n('b4', '正文/规则', 'TEXT', [], { text: '旧规则四', w: 800, h: 44 }),
    n('f2', '配图', 'GROUP', ['fr2', 'fh2'], { w: 800, h: 450 }),
    n('fr2', '配图占位', 'RECTANGLE', [], { w: 800, h: 450 }),
    n('fh2', '配图占位文案', 'TEXT', [], { text: '配图占位：待手动替换', w: 400, h: 40 })
  ];
}

/** 蛋仔形状的簇：一段 run，配图是裸矩形。 */
export function bareFigureRun(): NodeInfo[] {
  return [
    n('k', '簇', 'COMPONENT', ['header', 't1', 'rf1', 'b1', 'figure'], { w: 916, h: 800 }),
    n('header', 'Group 1253', 'GROUP', ['main', 'num'], { w: 916, h: 120 }),
    n('num', 'Number', 'INSTANCE', [], { w: 63, h: 63 }),
    n('main', '#Title_Main', 'TEXT', [], { text: '撤离', w: 72, h: 52 }),
    n('t1', '#Title', 'TEXT', [], { text: '入口', w: 300, h: 44 }),
    n('rf1', 'Frame 427319720', 'FRAME', [], { w: 300, h: 40 }),
    n('b1', '正文/规则', 'TEXT', [], { text: '旧规则', w: 872, h: 129 }),
    n('figure', '配图', 'RECTANGLE', [], { w: 872, h: 490, hasImageFill: true })
  ];
}
